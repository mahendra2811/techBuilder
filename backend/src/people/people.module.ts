import { Module } from '@nestjs/common';
import { MeGuardianController, PeopleController } from './people.controller';
import { PeopleService } from './people.service';

@Module({
  controllers: [PeopleController, MeGuardianController],
  providers: [PeopleService],
  exports: [PeopleService],
})
export class PeopleModule {}
