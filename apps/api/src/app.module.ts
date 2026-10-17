import { Controller, Get, Module } from '@nestjs/common';

@Controller('health')
class HealthController {
  /** HTTP 프로세스의 응답만 확인한다. DB 연결이나 제품 기능의 준비 상태는 포함하지 않는다. */
  @Get()
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

@Module({ controllers: [HealthController] })
export class AppModule {}
