import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class CheckFlagDto {
  @IsString()
  @IsNotEmpty()
  flagKey: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsObject()
  @IsOptional()
  userContext?: {
    role?: string;
    level?: number;
    xp?: number;
    custom?: Record<string, any>;
  };
}
