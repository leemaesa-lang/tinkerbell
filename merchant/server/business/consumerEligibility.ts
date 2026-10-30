import { TRPCError } from "@trpc/server";

export function assertMinorRestrictedCouponEligible(minorRestricted: boolean, isVerifiedAdult: boolean): void {
  if (minorRestricted && !isVerifiedAdult) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "다날 성인 본인인증이 확인된 계정만 미성년자 제한 쿠폰을 받을 수 있습니다.",
    });
  }
}

export function assertConsumerCouponClaimEligibility(
  profile: { phoneCiphertext: string | null; phoneVerifiedAt: Date | null },
  isMemberOfCouponBusiness: boolean,
): void {
  if (!profile.phoneCiphertext || !profile.phoneVerifiedAt) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "휴대폰 본인인증이 완료된 소비자 계정만 쿠폰을 받을 수 있습니다. 현재 인증 연동은 준비 중입니다.",
    });
  }

  if (isMemberOfCouponBusiness) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "본인이 소속된 사업자 계정의 쿠폰은 소비자 계정으로 받을 수 없습니다.",
    });
  }
}
