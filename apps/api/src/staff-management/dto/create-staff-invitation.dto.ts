export class CreateStaffInvitationDto {
  role?: string;
  expiresInHours?: number;
}

export class RedeemStaffInvitationDto {
  code?: string;
}
