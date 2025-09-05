import { CreateTaskPayloadData } from '../interfaces';
import {
  IsDefined,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
} from 'class-validator';

export class CreateTaskDto implements CreateTaskPayloadData {
  @IsOptional()
  @IsUUID()
  public id?: string;

  @IsDefined()
  @IsNumber()
  public number: number;

  @IsDefined()
  @IsString()
  public externalId: string;

  @IsDefined()
  @IsString()
  public state: string;

  @IsDefined()
  @IsString()
  public title: string;

  @IsDefined()
  @IsUrl()
  public url: string;

  @IsOptional()
  @IsString()
  public comments?: string;
}
