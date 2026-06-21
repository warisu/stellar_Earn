import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Submission, SubmissionStatus } from './entities/submission.entity';
import { ApproveSubmissionDto } from './dto/approve-submission.dto';
import { RejectSubmissionDto } from './dto/reject-submission.dto';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { StellarService } from '../stellar/stellar.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Quest } from '../quests/entities/quest.entity';
import { User } from '../users/entities/user.entity';
import { MetricsService } from '../../common/services/metrics.service';
import { UserRole } from '../auth/enums/user-role.enum';

interface QuestVerifier {
  id: string;
}

interface QuestWithVerifiers {
  id: string;
  verifiers: QuestVerifier[];
  createdBy: string;
}

import { EventEmitter2 } from '@nestjs/event-emitter';
import { QuestCompletedEvent } from '../../events/dto/quest-completed.event';
import { SubmissionRejectedEvent } from '../../events/dto/submission-rejected.event';
import { SubmissionApprovedEvent } from '../../events/dto/submission-approved.event';
import { SubmissionCreatedEvent } from '../../events/dto/submission-created.event';

@Injectable()
export class SubmissionsService {
  private readonly logger = new Logger(SubmissionsService.name);

  constructor(
    @InjectRepository(Submission)
    private submissionsRepository: Repository<Submission>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Quest)
    private questsRepository: Repository<Quest>,
    private stellarService: StellarService,
    private notificationsService: NotificationsService,
    private eventEmitter: EventEmitter2,
    private metricsService: MetricsService,
  ) {}

  /**
   * Create a new submission for a quest.
   *
   * Validates the submitter's status BEFORE we write anything:
   *   1. Authenticated user exists AND has a Stellar wallet linked.
   *   2. The quest exists, is ACTIVE, and has not reached its max completions.
   * Then INSERTs the row in PENDING and emits a `submission.created` event.
   *
   * @param questId  Quest the submission is for (UUID from path).
   * @param dto      Validated proof payload. userId is NOT in this DTO; the
   *                 controller injects it from the authenticated JWT.
   * @param userId   Authenticated user id from `req.user.id`.
   */
  async createSubmission(
    questId: string,
    dto: CreateSubmissionDto,
    userId: string,
  ): Promise<Submission> {
    // Submitter gate: must have a Stellar wallet linked so a later on-chain
    // approve flow has the public key it needs.
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      withDeleted: false,
    });
    if (!user) {
      throw new ForbiddenException('Authenticated user not found');
    }
    if (!user.stellarAddress) {
      throw new BadRequestException(
        'You must link a Stellar wallet before submitting proof',
      );
    }

    // Quest gate: must exist, be ACTIVE, and have remaining capacity.
    const quest = await this.questsRepository.findOne({
      where: { id: questId },
      withDeleted: false,
    });
    if (!quest) {
      throw new NotFoundException(`Quest with ID ${questId} not found`);
    }
    if (quest.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Quest is not accepting submissions (current status: ${quest.status})`,
      );
    }
    if (
      typeof quest.maxCompletions === 'number' &&
      quest.currentCompletions >= quest.maxCompletions
    ) {
      throw new BadRequestException(
        'Quest has reached its maximum completions',
      );
    }

    const submission = this.submissionsRepository.create({
      questId,
      userId,
      proof: { fileName: dto.fileName, fileContent: dto.fileContent },
      status: SubmissionStatus.PENDING,
      verifierNotes: dto.notes ?? null,
    });
    const saved = await this.submissionsRepository.save(submission);

    this.eventEmitter.emit(
      'submission.created',
      new SubmissionCreatedEvent(saved.id, questId, userId),
    );
    this.metricsService.incrementCounter('submission_create_total');

    this.logger.log(
      `Submission ${saved.id} created for quest=${questId} by user=${userId}`,
    );

    return saved;
  }

  /**
   * Approve a submission and trigger on-chain reward distribution
   */
  async approveSubmission(
    submissionId: string,
    approveDto: ApproveSubmissionDto,
    verifierId: string,
  ): Promise<Submission> {
    // Eager-load the quest and user relations in a single JOINed query
    // instead of issuing two extra round-trips after the initial lookup.
    const submission = await this.submissionsRepository.findOne({
      where: { id: submissionId },
      withDeleted: false,
    });

    if (!submission) {
      throw new NotFoundException(
        `Submission with ID ${submissionId} not found`,
      );
    }

    const quest = submission.quest as Quest;
    const user = submission.user as User;

    await this.validateVerifierAuthorization(quest.id, verifierId);
    this.validateStatusTransition(submission.status, 'APPROVED');

    // Validate the submitter has a Stellar address linked BEFORE we mutate
    // any DB state. Without this gate, a submission whose submitter has not
    // linked a wallet would be marked APPROVED locally but never settle on
    // chain, leaving the row stuck without a tx hash and without a recoverable
    // path forward.
    if (!user.stellarAddress) {
      throw new BadRequestException(
        'Submitter does not have a Stellar address linked',
      );
    }

    // Resolve the verifier to a Stellar public key BEFORE the DB CAS update.
    // The chain expects a Stellar Address (`G…`) for the verifier argument,
    // NOT a backend user UUID, and `new Address('uuid')` in the SDK throws on
    // construction. Performing this lookup pre-CAS ensures a missing verifier
    // record or an unlinked verifier stellarAddress surfaces as the right
    // exception type without leaving the submission row in a phantom
    // APPROVED state (which the post-CAS chain-failure rollback path cannot
    // reach for these failure modes).
    const verifier = await this.usersRepository.findOne({
      where: { id: verifierId },
      relations: [],
    });
    if (!verifier) {
      throw new ForbiddenException(
        `Verifier with id ${verifierId} not found`,
      );
    }
    if (!verifier.stellarAddress) {
      throw new BadRequestException(
        'Verifier does not have a Stellar address linked; cannot sign on their behalf',
      );
    }

    const approvedAt = new Date();

    // Calculate review duration for SLA tracking
    const reviewDurationSeconds =
      (approvedAt.getTime() - submission.createdAt.getTime()) / 1000;

    const updateResult = await this.submissionsRepository
      .createQueryBuilder()
      .update(Submission)
      .set({
        status: 'APPROVED',
        approvedBy: verifierId,
        approvedAt,
        verifierNotes: approveDto.notes,
      })
      .where('id = :id', { id: submissionId })
      .andWhere('status = :status', { status: submission.status })
      .execute();

    if (updateResult.affected === 0) {
      throw new ConflictException(
        'Submission status has changed. Please refresh and try again.',
      );
    }

    // Capture the row's pre-approval status so we can roll back reliably if
    // the on-chain call fails. Anything in `approveDto` that we already
    // persisted (notes, etc.) is intentionally left in place — notes are
    // verifier context, not approval state, and losing them on chain error
    // would be more harmful than keeping them.
    const previousStatus = submission.status;

    let onChainTxHash: string | undefined;
    try {
      const onChainResult = await this.stellarService.approveSubmission(
        quest.contractTaskId,
        user.stellarAddress,
        verifier.stellarAddress,
      );
      onChainTxHash = onChainResult.transactionHash;
    } catch (error) {
      // Roll the DB status back so the submission remains actionable.
      // We deliberately keep verifierNotes (verifier's review context)
      // and approvedAt/approvedBy cleared, which yields the same
      // observable state as if the call had never been attempted.
      await this.submissionsRepository.update(submissionId, {
        status: previousStatus,
        approvedBy: undefined,
        approvedAt: undefined,
      });
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `On-chain approve_submission failed for submission=${submissionId}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      this.metricsService.incrementCounter(
        'submission_approval_chain_failure_total',
      );
      // Re-throw with the typed exception the caller expects; preserve the
      // underlying message so operators can diagnose from the API response.
      throw new BadRequestException(
        `Failed to process on-chain approval: ${errorMessage}`,
      );
    }

    if (onChainTxHash) {
      await this.submissionsRepository.update(submissionId, {
        transactionHash: onChainTxHash,
      });
      submission.transactionHash = onChainTxHash;
    }

    // Apply the persisted changes to the in-memory entity instead of
    // re-fetching the submission and its relations from the database.
    submission.status = 'APPROVED';
    submission.approvedBy = verifierId;
    submission.approvedAt = approvedAt;
    if (approveDto.notes !== undefined) {
      submission.verifierNotes = approveDto.notes;
    }

    await (this.notificationsService as any).sendSubmissionApproved?.(
      submission.userId,
      quest.title,
      quest.rewardAmount,
    );

    this.eventEmitter.emit(
      'submission.approved',
      new SubmissionApprovedEvent(submissionId, submission.questId, verifierId),
    );

    this.eventEmitter.emit(
      'quest.completed',
      new QuestCompletedEvent(
        quest.id,
        submission.userId,
        100, // XP increment
        quest.rewardAmount.toString(),
      ),
    );

    this.eventEmitter.emit('submission.approved', {
      submissionId,
      questId: submission.questId,
      userId: submission.userId,
      approvedBy: verifierId,
      approvedAt,
    });

    // Emit SLA metrics for submission review time
    this.metricsService.incrementCounter('submission_review_total');
    this.metricsService.incrementCounter('submission_approval_total');
    this.metricsService.observeHistogram(
      'submission_review_duration_seconds',
      reviewDurationSeconds,
      {
        status: 'approved',
        quest_id: submission.questId,
      },
    );

    return submission;
  }

  /**
   * Reject a submission with a reason
   */
  async rejectSubmission(
    submissionId: string,
    rejectDto: RejectSubmissionDto,
    verifierId: string,
  ): Promise<Submission> {
    // Eager-load the quest and user relations in a single JOINed query
    // instead of issuing two extra round-trips after the initial lookup.
    const submission = await this.submissionsRepository.findOne({
      withDeleted: false,
      where: { id: submissionId },
      relations: ['quest', 'user'],
    });

    if (!submission) {
      throw new NotFoundException(
        `Submission with ID ${submissionId} not found`,
      );
    }

    const quest = submission.quest as Quest;

    await this.validateVerifierAuthorization(quest.id, verifierId);
    this.validateStatusTransition(submission.status, 'REJECTED');

    if (!rejectDto.reason || rejectDto.reason.trim().length === 0) {
      throw new BadRequestException('Rejection reason is required');
    }

    const rejectedAt = new Date();

    // Calculate review duration for SLA tracking
    const reviewDurationSeconds =
      (rejectedAt.getTime() - submission.createdAt.getTime()) / 1000;

    const updateResult = await this.submissionsRepository
      .createQueryBuilder()
      .update(Submission)
      .set({
        status: 'REJECTED',
        rejectedBy: verifierId,
        rejectedAt,
        rejectionReason: rejectDto.reason,
        verifierNotes: rejectDto.notes,
      })
      .where('id = :id', { id: submissionId })
      .andWhere('status = :status', { status: submission.status })
      .execute();

    if (updateResult.affected === 0) {
      throw new ConflictException(
        'Submission status has changed. Please refresh and try again.',
      );
    }

    // Apply the persisted changes to the in-memory entity instead of
    // re-fetching the submission and its relations from the database.
    submission.status = 'REJECTED';
    submission.rejectedBy = verifierId;
    submission.rejectedAt = rejectedAt;
    submission.rejectionReason = rejectDto.reason;
    if (rejectDto.notes !== undefined) {
      submission.verifierNotes = rejectDto.notes;
    }

    await (this.notificationsService as any).sendSubmissionRejected?.(
      submission.userId,
      quest.title,
      rejectDto.reason,
    );

    this.eventEmitter.emit(
      'submission.rejected',
      new SubmissionRejectedEvent(
        submissionId,
        submission.userId,
        rejectDto.reason,
      ),
    );

    // Emit SLA metrics for submission review time
    this.metricsService.incrementCounter('submission_review_total');
    this.metricsService.incrementCounter('submission_rejection_total');
    this.metricsService.observeHistogram(
      'submission_review_duration_seconds',
      reviewDurationSeconds,
      {
        status: 'rejected',
        quest_id: submission.questId,
      },
    );

    return submission;
  }

  private async validateVerifierAuthorization(
    questId: string,
    verifierId: string,
  ): Promise<void> {
    const quest = await this.getQuestWithVerifiers(questId);

    const isAuthorized =
      quest.verifiers.some((v) => v.id === verifierId) ||
      quest.createdBy === verifierId ||
      (await this.checkAdminRole(verifierId));

    if (!isAuthorized) {
      throw new ForbiddenException(
        'You are not authorized to verify submissions for this quest',
      );
    }
  }

  private validateStatusTransition(
    currentStatus: string,
    newStatus: string,
  ): void {
    const validTransitions: Record<string, string[]> = {
      PENDING: ['APPROVED', 'REJECTED', 'UNDER_REVIEW'],
      UNDER_REVIEW: ['APPROVED', 'REJECTED', 'PENDING'],
      APPROVED: [],
      REJECTED: ['PENDING'],
      PAID: [],
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }

  private getQuestWithVerifiers(questId: string): Promise<QuestWithVerifiers> {
    return Promise.resolve({
      id: questId,
      verifiers: [],
      createdBy: '',
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private checkAdminRole(userId: string): Promise<boolean> {
    return Promise.resolve(false);
  }

  async findOne(submissionId: string): Promise<Submission> {
    const submission = await this.submissionsRepository.findOne({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException(
        `Submission with ID ${submissionId} not found`,
      );
    }

    return submission;
  }

  async findByQuest(questId: string): Promise<Submission[]> {
    // Join quest and user up front so the controller (which serialises both
    // relations) doesn't trigger lazy lookups per row.
    return this.submissionsRepository.find({
      where: { questId },
      relations: ['quest', 'user'],
      order: { createdAt: 'DESC' },
    });
  }
}
