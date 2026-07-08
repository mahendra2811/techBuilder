import { Module } from '@nestjs/common';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

// NOT registered in app.module.ts — the orchestrator wires it in centrally (WO-13 convention).
@Module({
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
