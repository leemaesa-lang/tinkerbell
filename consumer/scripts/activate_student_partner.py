from pathlib import Path
p = Path('/home/ubuntu/tinkerbell-dc-prototype/client/src/pages/Home.tsx')
s = p.read_text()
old_state = 'const [partnerRecruitmentOpen, setPartnerRecruitmentOpen] = useState(false); const [policyOpen'
new_state = 'const [partnerRecruitmentOpen, setPartnerRecruitmentOpen] = useState(false); const [studentInviteOpen, setStudentInviteOpen] = useState(false); const [policyOpen'
if old_state not in s:
    raise SystemExit('state anchor not found')
s = s.replace(old_state, new_state, 1)
old_component = '''function ConsumerPartnerSheet({ userTier, onClose, onStartMembership, onToast }: { userTier: "FREE" | "PREMIUM"; onClose: () => void; onStartMembership: () => void; onToast: (message: string) => void }) {'''
new_component = r'''function StudentPartnerInviteSheet({ onClose, onOpenCoupons, onToast }: { onClose: () => void; onOpenCoupons: () => void; onToast: (message: string) => void }) {
  const studentCode = window.localStorage.getItem("dangam_student_partner_code") || "STU-8821";
  const [inviteCount] = useState(() => Math.min(3, Number(window.localStorage.getItem(`dangam_referral_count_${studentCode}`) || "0")));
  const referralLink = `${window.location.origin}/partner/join?ref=${studentCode}`;
  const copyCode = async () => { try { await navigator.clipboard?.writeText(studentCode); } catch { /* clipboard may be unavailable */ } onToast("코드가 복사되었습니다"); };
  const shareInvite = async () => {
    if (navigator.share) { try { await navigator.share({ title: "단감 학생 파트너 초대", text: `단감 친구 초대 코드 ${studentCode}로 가입해 보세요!`, url: referralLink }); return; } catch { /* 사용자가 공유 창을 닫은 경우 */ } }
    try { await navigator.clipboard?.writeText(referralLink); } catch { /* clipboard may be unavailable */ }
    onToast("카카오톡으로 보낼 초대 링크가 복사되었습니다.");
  };
  return <div className="overlay student-invite-overlay" onClick={onClose}><section className="student-invite-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="student-invite-title">
    <header className="student-invite-header"><div><p className="eyebrow">STUDENT PARTNER</p><h2 id="student-invite-title">🎉 학생 파트너 등록 완료!</h2><p>친구 3명을 초대할 때마다 100% 무료 쿠폰 1장이 자동 지급됩니다.</p></div><button type="button" onClick={onClose} aria-label="학생 파트너 초대 센터 닫기"><X size={18} /></button></header>
    <div className="student-invite-body">
      <section className="student-code-card"><div><small>내 추천코드</small><strong>{studentCode}</strong></div><button type="button" onClick={copyCode}><Copy size={14} /> 코드 복사</button></section>
      <section className="student-progress-card"><div className="student-progress-head"><b>초대 현황</b><span>현재 초대: {inviteCount}명 / 목표: 3명</span></div><div className="student-stamps" aria-label={`초대 ${inviteCount}명 달성`} >{[0, 1, 2].map((index) => <span key={index} className={index < inviteCount ? "earned" : ""}>{index < inviteCount ? "✓" : index + 1}</span>)}</div><p>남은 인원: <b>{Math.max(0, 3 - inviteCount)}명</b> · 3칸 달성 시 무료 쿠폰함으로 자동 지급</p></section>
      <button type="button" className="student-share-button" onClick={shareInvite}>카카오톡 / 친구에게 공유 링크 보내기 <ArrowRight size={15} /></button>
      <button type="button" className="student-wallet-button" onClick={() => { onClose(); onOpenCoupons(); }}>내 무료 쿠폰함 가기 <Ticket size={15} /></button>
    </div>
  </section></div>;
}
function ConsumerPartnerSheet({ userTier, onClose, onStartMembership, onToast }: { userTier: "FREE" | "PREMIUM"; onClose: () => void; onStartMembership: () => void; onToast: (message: string) => void }) {'''
if old_component not in s:
    raise SystemExit('component anchor not found')
s = s.replace(old_component, new_component, 1)
old_render = '''{partnerRecruitmentOpen && <PartnerRecruitmentSheet onClose={() => setPartnerRecruitmentOpen(false)} onStudentStart={() => { setPartnerRecruitmentOpen(false); window.localStorage.setItem("dangam_student_partner_code", window.localStorage.getItem("dangam_consumer_partner_code") || "1042"); showHeaderToast("학생 파트너 추천코드가 발급되었습니다. 친구 3명을 초대해 보세요!"); }} onAdultStart={() => { setPartnerRecruitmentOpen(false); setPartnerFormMode(true); setLocalPartnerOpen(true); }} />}'''
new_render = '''{partnerRecruitmentOpen && <PartnerRecruitmentSheet onClose={() => setPartnerRecruitmentOpen(false)} onStudentStart={() => { setPartnerRecruitmentOpen(false); window.localStorage.setItem("dangam_student_partner_code", "STU-8821"); setStudentInviteOpen(true); }} onAdultStart={() => { setPartnerRecruitmentOpen(false); setPartnerFormMode(true); setLocalPartnerOpen(true); }} />}{studentInviteOpen && <StudentPartnerInviteSheet onClose={() => setStudentInviteOpen(false)} onOpenCoupons={openCoupons} onToast={showHeaderToast} />}'''
if old_render not in s:
    raise SystemExit('render anchor not found')
s = s.replace(old_render, new_render, 1)
p.write_text(s)
PY
python3 /home/ubuntu/tinkerbell-dc-prototype/scripts/activate_student_partner.py
rm /home/ubuntu/tinkerbell-dc-prototype/scripts/activate_student_partner.py
cat >> /home/ubuntu/tinkerbell-dc-prototype/client/src/index.css <<'CSS'

/* Student partner invitation center */
.student-invite-overlay { align-items: center; padding: 14px; }
.student-invite-sheet { position: relative; width: min(390px, 100%); max-height: calc(100vh - 28px); overflow: hidden; border-radius: 22px; background: #fffdf9; box-shadow: 0 20px 60px rgba(15,23,42,.28); animation: rise .25s ease both; }
.student-invite-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 18px 17px 14px; border-bottom: 1px solid #eee6dd; background: linear-gradient(135deg, #fff9e8, #fffdf9); }
.student-invite-header > div { min-width: 0; }
.student-invite-header h2 { margin: 3px 0 5px; color: #29231f; font-size: 20px; font-weight: 950; letter-spacing: -.06em; }
.student-invite-header p:not(.eyebrow) { margin: 0; color: #756b63; font-size: 12px; font-weight: 700; line-height: 1.4; }
.student-invite-header button { display: grid; place-items: center; width: 32px; height: 32px; flex: 0 0 auto; border: 1px solid #e6ddd4; border-radius: 50%; background: #fff; color: #756b63; }
.student-invite-body { display: grid; gap: 11px; padding: 14px 15px 17px; }
.student-code-card { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 15px; border-radius: 16px; background: linear-gradient(135deg, #ff8b2e, #f04f36); color: #fff; box-shadow: 0 8px 18px rgba(240,79,54,.18); }
.student-code-card div { display: grid; gap: 3px; }
.student-code-card small { color: #fff4df; font-size: 11px; font-weight: 800; }
.student-code-card strong { font-size: 27px; letter-spacing: .04em; }
.student-code-card button { display: flex; align-items: center; gap: 4px; padding: 8px 10px; border: 0; border-radius: 10px; background: #fff; color: #c34e27; font-size: 11px; font-weight: 900; }
.student-progress-card { padding: 13px; border: 1px solid #f1d99a; border-radius: 15px; background: #fff8dc; color: #624b1d; }
.student-progress-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; }
.student-progress-head span { color: #826b34; font-size: 11px; font-weight: 800; }
.student-stamps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; margin: 12px 0 9px; }
.student-stamps span { display: grid; place-items: center; height: 48px; border: 2px dashed #e4c978; border-radius: 13px; background: rgba(255,255,255,.6); color: #b08a33; font-size: 19px; font-weight: 950; }
.student-stamps span.earned { border-style: solid; border-color: #f59e0b; background: #f59e0b; color: #fff; }
.student-progress-card p { margin: 0; color: #907536; font-size: 10px; font-weight: 700; }
.student-share-button, .student-wallet-button { display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; min-height: 46px; border-radius: 12px; font-size: 13px; font-weight: 900; transition: transform .16s ease, background .16s ease; }
.student-share-button { border: 0; background: #ffb11b; color: #4b2b05; box-shadow: 0 5px 12px rgba(245,158,11,.2); }
.student-wallet-button { border: 1px solid #eadfd5; background: #fff; color: #554a42; }
.student-share-button:active, .student-wallet-button:active, .student-code-card button:active { transform: scale(.98); }
@media (max-height: 680px) { .student-invite-header { padding: 13px 14px 10px; } .student-invite-header h2 { font-size: 18px; } .student-invite-body { gap: 8px; padding: 10px 12px 12px; } .student-code-card { padding: 11px 12px; } .student-code-card strong { font-size: 23px; } .student-progress-card { padding: 10px; } .student-stamps { margin: 8px 0 6px; } .student-stamps span { height: 39px; } }
CSS
