import { Body, Controller, Delete, Get, Headers, Param, Post } from '@nestjs/common';
import { AuthService, PERMISSIONS } from '../auth/auth.service';
import { CreateStaffInvitationDto, RedeemStaffInvitationDto } from './dto/create-staff-invitation.dto';
import { StaffManagementService } from './staff-management.service';

@Controller('api/v1/staff')
export class StaffManagementController {
  constructor(
    private readonly managementService: StaffManagementService,
    private readonly authService: AuthService
  ) {}

  @Get('members')
  async listMembers(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string
  ) {
    await this.authService.requirePermission(authorization, PERMISSIONS.STAFF_MANAGE, staffOpenId);
    return { items: await this.managementService.listMembers() };
  }

  @Delete('members/:id')
  async disableMember(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string,
    @Param('id') memberId?: string
  ) {
    const actor = await this.authService.requirePermission(authorization, PERMISSIONS.STAFF_MANAGE, staffOpenId);
    return { item: await this.managementService.disableMember(actor, memberId) };
  }

  @Get('invitations')
  async listInvitations(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string
  ) {
    const actor = await this.authService.requirePermission(authorization, PERMISSIONS.STAFF_MANAGE, staffOpenId);
    return { items: await this.managementService.listInvitations(actor) };
  }

  @Post('invitations')
  async createInvitation(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string,
    @Body() payload: CreateStaffInvitationDto = {}
  ) {
    const actor = await this.authService.requirePermission(authorization, PERMISSIONS.STAFF_MANAGE, staffOpenId);
    return this.managementService.createInvitation(actor, payload);
  }

  @Delete('invitations/:id')
  async revokeInvitation(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string,
    @Param('id') invitationId?: string
  ) {
    const actor = await this.authService.requirePermission(authorization, PERMISSIONS.STAFF_MANAGE, staffOpenId);
    return { item: await this.managementService.revokeInvitation(actor, invitationId) };
  }

  @Post('invitations/redeem')
  async redeemInvitation(
    @Headers('authorization') authorization?: string,
    @Headers('x-customer-openid') customerOpenId?: string,
    @Body() payload: RedeemStaffInvitationDto = {}
  ) {
    const openId = await this.authService.resolveCustomerOpenId(authorization, customerOpenId);
    return this.managementService.redeemInvitation(openId, payload?.code);
  }
}
