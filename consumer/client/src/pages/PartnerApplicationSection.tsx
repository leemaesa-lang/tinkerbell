import { useState } from "react";
import { ChevronLeft, FileText, ShieldCheck } from "lucide-react";
import { KOREAN_BANK_OPTIONS } from "@/data/korean-banks";
import { toast } from "sonner";

type PartnerApplicationSectionProps = {
  onBack: () => void;
  onSubmitted: () => void;
  onRegularMembership: () => void;
};

export default function PartnerApplicationSection({
  onBack,
  onSubmitted,
  onRegularMembership,
}: PartnerApplicationSectionProps) {
  const [name, setName] = useState("민지");
  const [phone, setPhone] = useState("010-1234-5678");
  const [age, setAge] = useState("30대");
  const [gender, setGender] = useState("여성");
  const [bank, setBank] = useState("카카오뱅크");
  const [account, setAccount] = useState("3333-12-3456789");
  const [bankFile, setBankFile] = useState("");
  const [idFile, setIdFile] = useState("");
  const [consent, setConsent] = useState(false);

  const submit = () => {
    if (!name.trim() || phone.replace(/\D/g, "").length < 10 || !account.trim() || !bankFile || !idFile || !consent) {
      toast.error("기본 정보·계좌·필수 서류·동의를 모두 확인해 주세요.");
      return;
    }
    window.localStorage.setItem("dangam_local_sales_partner_status", "PENDING");
    toast.success("지원서가 접수되었습니다. 본사 승인 후 실적 센터가 활성화됩니다.");
    onSubmitted();
  };

  return (
    <div className="min-h-screen bg-[#f6f8fa] pb-10 text-[#10243f]">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[900px] items-center gap-3">
          <button type="button" onClick={onBack} className="rounded-xl border border-slate-200 p-2 text-slate-500" aria-label="뒤로 가기">
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0 flex-1"><h1 className="break-keep text-lg font-black leading-snug">회원 영업 파트너 지원서</h1></div>
          <ShieldCheck size={22} className="text-emerald-500" />
        </div>
      </header>

      <main className="partner-application-main mx-auto max-w-[900px] space-y-2 px-3 py-2 sm:px-6 sm:py-4">
        <section className="partner-application-hero rounded-2xl bg-gradient-to-br from-[#10243f] via-[#173659] to-[#274d74] p-3 text-white shadow-lg sm:p-4">
          <h2 className="mt-1 text-[20px] font-black leading-snug">회원 영업 파트너 지원서</h2>
          <p className="mt-1 text-[15px] leading-6 text-blue-100">친구와 이웃에게 팅커벨을 소개하고, 매월 정산 혜택을 받아보세요.</p>
        </section>

        <section className="partner-application-section rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <h2 className="text-[18px] font-black">기본 정보</h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[14px] font-bold text-slate-700">회원 파트너명<input className="partner-application-input" value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label className="text-[14px] font-bold text-slate-700">연락처<input className="partner-application-input" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
            <label className="text-[14px] font-bold text-slate-700">연령대<select className="partner-application-input" value={age} onChange={(event) => setAge(event.target.value)}><option>20대</option><option>30대</option><option>40대</option><option>50대 이상</option></select></label>
            <label className="text-[14px] font-bold text-slate-700">성별<select className="partner-application-input" value={gender} onChange={(event) => setGender(event.target.value)}><option>여성</option><option>남성</option></select></label>
          </div>
        </section>

        <section className="partner-application-section rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <h2 className="text-[18px] font-black">수당 입금 계좌</h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[14px] font-bold text-slate-700">은행<select className="partner-application-input" value={bank} onChange={(event) => setBank(event.target.value)}>{KOREAN_BANK_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="text-[14px] font-bold text-slate-700">계좌번호<input className="partner-application-input" inputMode="numeric" value={account} onChange={(event) => setAccount(event.target.value)} /></label>
          </div>
          <label className="partner-holder-field mt-2 block text-[14px] font-bold text-slate-700">예금주명<input className="partner-application-input" value={name} readOnly aria-readonly="true" /></label>
        </section>

        <section className="partner-application-section rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <h2 className="text-[18px] font-black">필수 서류 첨부</h2>
          <label className="partner-application-file mt-2"><span><FileText size={18} />수당 입금용 통장 사본 <small>{bankFile || "파일을 선택해 주세요"}</small></span><input type="file" accept="image/*,.pdf" onChange={(event) => setBankFile(event.target.files?.[0]?.name ?? "")} /></label>
          <label className="partner-application-file mt-2"><span><FileText size={18} />신분증 사본 <small>{idFile || "파일을 선택해 주세요"}</small></span><input type="file" accept="image/*,.pdf" onChange={(event) => setIdFile(event.target.files?.[0]?.name ?? "")} /><em>※ 주민번호 뒷자리는 가림 처리해 주세요.</em></label>
        </section>

        <section className="partner-application-consent rounded-2xl border border-orange-100 bg-orange-50 p-3 sm:p-4">
          <label className="flex items-start gap-3 text-[15px] font-bold leading-6 text-slate-800"><input className="mt-1 h-5 w-5 shrink-0 accent-orange-500" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>[필수] 개인정보 수집 및 이용과 수당 원천징수 처리에 동의합니다.</span></label>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={submit} className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[#ff6b35] px-4 py-3 text-[17px] font-black text-white shadow-md">영업 파트너 지원서 제출 <span className="ml-2">→</span></button>
            <button type="button" onClick={onRegularMembership} className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[16px] font-bold text-slate-700">정회원으로만 등록</button>
          </div>
        </section>
      </main>
    </div>
  );
}
