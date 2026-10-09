import { redirect } from "next/navigation";
import { ASR, LANGUAGES, METHODS } from "@/lib/account";
import { settingsOf } from "@/lib/dashboard";
import { currentPersonId } from "@/lib/site/session";
import { PrayerForm } from "../Forms";

/** Prayer settings and language, set once; platforms read them with GET /v1/settings. */
export default async function Prayer() {
  const personId = await currentPersonId();
  if (!personId) redirect("/signin");
  const s = await settingsOf(personId);
  return (
    <>
      <div>
        <h1 className="d-title">Prayer settings</h1>
        <p className="d-sub">Set once. Every platform you allow uses them, so you are not asked again in each one.</p>
      </div>
      <PrayerForm
        methods={METHODS} asr={ASR} languages={LANGUAGES}
        initial={{
          city: s?.prayer_city ?? "", lat: s?.prayer_lat ?? "", lng: s?.prayer_lng ?? "", method: s?.prayer_method ?? "",
          asr: s?.asr_method ?? "", hijriAdjust: s?.hijri_adjust ?? 0, language: s?.language ?? "", tz: s?.tz ?? "",
        }}
      />
    </>
  );
}
