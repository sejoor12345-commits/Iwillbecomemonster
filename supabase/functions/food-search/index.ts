// 식약처 식품영양성분 DB 검색 (Supabase Edge Function = 서버 쪽 작은 함수)
//
// [지도]
//   들어오는 것: 앱이 보낸 { q: "홀리닭" }  (로그인한 사람만: verify_jwt)
//   하는 일:     비밀값 FOOD_API_KEY(공공데이터포털 인증키)를 붙여서 식약처 API에 물어보기
//                → 앱이 쓰기 쉬운 모양으로 정리 (키는 앱에 절대 안 보냄)
//   나가는 것:   { items: [ { name, maker, basis: 100, unit: "g", total: 200, kcal, c, p, f } ] }
//                basis = 영양성분 기준량 (보통 100g), total = 제품 한 개 중량 (모르면 null)

const API = "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02";
const ROWS = 30;                                         // 한 번에 받아 올 결과 수

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// "100g" → { amount: 100, unit: "g" },  "1회 제공량 30g" → 30g,  없으면 null
function amountOf(text: unknown) {
  const m = /([\d.]+)\s*(g|ml|mL)/.exec(String(text ?? ""));
  return m ? { amount: Number(m[1]), unit: m[2].toLowerCase() } : null;
}
const n = (x: unknown) => { const v = parseFloat(String(x ?? "")); return isNaN(v) ? 0 : v; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { q, raw } = await req.json().catch(() => ({}));
  if (!q || String(q).trim().length < 1) return json({ items: [] });
  const key = Deno.env.get("FOOD_API_KEY") ?? "";
  const url = `${API}?serviceKey=${encodeURIComponent(key)}&pageNo=1&numOfRows=${ROWS}&type=json&FOOD_NM_KR=${encodeURIComponent(String(q).trim())}`;
  const res = await fetch(url);
  const text = await res.text();
  if (raw) return json({ status: res.status, keyCheck: `${key.slice(0, 6)}…${key.slice(-4)} (${key.length}자)`, body: text.slice(0, 8000) });   // 확인용: 식약처 원본 그대로 + 키 앞뒤 몇 자만
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: "식약처 응답을 읽지 못했어요" }, 502); }
  const fail = body?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnAuthMsg;
  if (fail) return json({ error: fail }, 502);
  const items = (body?.body?.items ?? []).map((it: Record<string, unknown>) => {
    const basis = amountOf(it.SERVING_SIZE) ?? { amount: 100, unit: "g" };
    const total = amountOf(it.Z10500);
    return {
      name: String(it.FOOD_NM_KR ?? "").trim(),
      maker: String(it.MAKER_NM ?? "").trim() || null,
      basis: basis.amount, unit: basis.unit,
      total: total ? total.amount : null,
      kcal: n(it.AMT_NUM1), p: n(it.AMT_NUM3), f: n(it.AMT_NUM4), c: n(it.AMT_NUM6),
    };
  });
  return json({ items });
});
