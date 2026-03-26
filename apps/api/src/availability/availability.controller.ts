import { Controller, Get, Query } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { GetAvailabilityQuery } from './dto/get-availability.query';

@Controller('api/v1/availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  async getAvailability(@Query() query: GetAvailabilityQuery = {}) {
    return this.availabilityService.getAvailability(query.date);
  }
}
