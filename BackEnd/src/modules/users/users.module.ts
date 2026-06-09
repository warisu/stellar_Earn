import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User } from './entities/user.entity';
import { UserExperienceListener } from './events/user-experience.listener';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    EventEmitterModule,
  ],
  controllers: [UserController],
  providers: [UserService, UserExperienceListener],
  exports: [UserService],
})
export class UsersModule {}
