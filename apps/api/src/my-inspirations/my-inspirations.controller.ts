import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { CreateMyInspirationDto } from './dto/create-my-inspiration.dto';
import { ListMyInspirationsQuery } from './dto/list-my-inspirations.query';
import { UpdateMyInspirationDto } from './dto/update-my-inspiration.dto';
import { MyInspirationsService } from './my-inspirations.service';

@Controller('api/v1/my/inspirations')
export class MyInspirationsController {
  constructor(
    private readonly myInspirationsService: MyInspirationsService,
    private readonly authService: AuthService
  ) {}

  @Get()
  async listItems(
    @Headers('authorization') authorization?: string,
    @Headers('x-customer-openid') customerOpenId?: string,
    @Query() query: ListMyInspirationsQuery = {}
  ) {
    const resolvedCustomerOpenId = await this.resolveCustomerOpenId(
      authorization,
      customerOpenId
    );
    return this.myInspirationsService.listItems(resolvedCustomerOpenId, query);
  }

  @Get(':id')
  async getItem(
    @Headers('authorization') authorization?: string,
    @Headers('x-customer-openid') customerOpenId?: string,
    @Param('id') inspirationId?: string
  ) {
    const resolvedCustomerOpenId = await this.resolveCustomerOpenId(
      authorization,
      customerOpenId
    );
    const item = await this.myInspirationsService.getItem(
      resolvedCustomerOpenId,
      inspirationId
    );
    return { item };
  }

  @Post()
  async createItem(
    @Headers('authorization') authorization?: string,
    @Headers('x-customer-openid') customerOpenId?: string,
    @Body() payload: CreateMyInspirationDto = {}
  ) {
    const resolvedCustomerOpenId = await this.resolveCustomerOpenId(
      authorization,
      customerOpenId
    );
    const item = await this.myInspirationsService.createItem(
      resolvedCustomerOpenId,
      payload
    );
    return { item };
  }

  @Patch(':id')
  async updateItem(
    @Headers('authorization') authorization?: string,
    @Headers('x-customer-openid') customerOpenId?: string,
    @Param('id') inspirationId?: string,
    @Body() payload: UpdateMyInspirationDto = {}
  ) {
    const resolvedCustomerOpenId = await this.resolveCustomerOpenId(
      authorization,
      customerOpenId
    );
    const item = await this.myInspirationsService.updateItem(
      resolvedCustomerOpenId,
      inspirationId,
      payload
    );
    return { item };
  }

  @Delete(':id')
  async deleteItem(
    @Headers('authorization') authorization?: string,
    @Headers('x-customer-openid') customerOpenId?: string,
    @Param('id') inspirationId?: string
  ) {
    const resolvedCustomerOpenId = await this.resolveCustomerOpenId(
      authorization,
      customerOpenId
    );
    const item = await this.myInspirationsService.deleteItem(
      resolvedCustomerOpenId,
      inspirationId
    );
    return { item };
  }

  private resolveCustomerOpenId(authorization?: string, customerOpenId?: string) {
    return this.authService.resolveCustomerOpenId(authorization, customerOpenId);
  }
}
