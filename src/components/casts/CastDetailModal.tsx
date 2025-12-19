"use client";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function CastDetailDesignModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[1100px] max-h-[90vh] overflow-y-auto bg-white shadow-xl">

        {/* ===== 上段：登録情報 ===== */}
        <div className="bg-[#6fa83f] p-4">
          <div className="grid grid-cols-2 gap-4">

            {/* ---------- 左：登録情報① ---------- */}
            <div>
              <SectionTitle title="登録情報①" />

              <div className="mt-2 grid grid-cols-[120px_1fr] gap-3">
                {/* 写真 */}
                <div className="row-span-6 flex items-center justify-center bg-[#3f67b1] text-white">
                  写真
                </div>

                <Field label="ふりがな" />
                <Field label="氏名" />
                <Field label="生年月日">
                  <input className="input" />
                  <button className="btn-sm ml-2">自動計算</button>
                  <span className="ml-2">歳</span>
                </Field>
                <Field label="現住所" />
                <Field label="TEL" />
                <Field label="アドレス" />

                <Field label="ジャンル">
                  <GenreButtons />
                </Field>

                <Field label="希望時給" />
                <Field label="キャストからの店舗NG">
                  <input className="input" />
                  <button className="btn-sm ml-2">＋</button>
                </Field>
                <Field label="シフト情報" />
                <Field label="身長" />
                <Field label="服のサイズ" />
                <Field label="靴のサイズ" />
                <Field label="タトゥー" />
                <Field label="飲酒" />
              </div>
            </div>

            {/* ---------- 右：登録情報② ---------- */}
            <div>
              <SectionTitle title="登録情報②" />

              <div className="mt-2 space-y-2">
                <CheckboxRow
                  label="どのように応募しましたか？"
                  items={[
                    "Google検索",
                    "Yahoo検索",
                    "SNS",
                    "Instagram",
                    "TikTok",
                    "紹介",
                    "口コミ",
                  ]}
                />

                <FieldVertical label="検索したワードを教えてください">
                  <input className="input w-full" />
                </FieldVertical>

                <FieldVertical label="他派遣会社への登録">
                  <select className="input w-full" />
                </FieldVertical>

                <FieldVertical label="不満だった点を教えてください">
                  <input className="input w-full" />
                </FieldVertical>

                <FieldVertical label="水商売の経験を教えてください">
                  <select className="input w-full" />
                </FieldVertical>

                <FieldVertical label="TBマナーの講習が必要ですか？">
                  <select className="input w-full" />
                </FieldVertical>

                <FieldVertical label="その他（備考）">
                  <textarea className="input w-full h-20" />
                </FieldVertical>

                <FieldVertical label="希望勤務地" />
                <FieldVertical label="希望時間帯" />
                <FieldVertical label="希望エリア" />
                <FieldVertical label="希望出勤日数" />
              </div>
            </div>
          </div>
        </div>

        {/* ===== 下段：スタッフ入力項目 ===== */}
        <div className="bg-[#f3a400] p-4">
          <SectionTitle title="スタッフ入力項目" color="blue" />

          <div className="mt-3 grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Field label="ティアラ査定給" />
              <Field label="送迎先" />
              <Field label="送迎先追加" />
              <Field label="担当" />
              <Field label="体系" />
              <Field label="身長" />
              <div className="flex gap-2">
                <button className="btn-sm">顔写真＋</button>
                <button className="btn-sm">本籍地記載書類</button>
              </div>
            </div>

            <div className="space-y-2">
              <Field label="ランク" />
              <Field label="店舗からNG">
                <input className="input" />
                <button className="btn-sm ml-2">＋追加</button>
              </Field>
              <Field label="専属指名" />
              <Field label="タトゥー" />
              <Field label="雰囲気">
                <input type="range" className="w-full" />
              </Field>
            </div>
          </div>
        </div>

        {/* ===== フッター ===== */}
        <div className="flex justify-center gap-4 p-4 bg-[#6fa83f]">
          <button className="btn">チャット連絡</button>
          <button className="btn">登録</button>
          <button className="btn">終了</button>
          <button className="btn">一時保存</button>
        </div>
      </div>
    </div>
  );
}

/* ====== parts ====== */

function SectionTitle({
  title,
  color = "green",
}: {
  title: string;
  color?: "green" | "blue";
}) {
  return (
    <div
      className={`inline-block px-3 py-1 text-white text-sm ${
        color === "green" ? "bg-blue-600" : "bg-blue-600"
      }`}
    >
      {title}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-32 text-white text-sm">{label}</div>
      {children ?? <input className="input flex-1" />}
    </div>
  );
}

function FieldVertical({
  label,
  children,
}: {
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-white text-sm mb-1">{label}</div>
      {children ?? <input className="input w-full" />}
    </div>
  );
}

function GenreButtons() {
  return (
    <div className="flex gap-2">
      {["クラブ", "キャバ", "スナック", "ガルバ"].map((g) => (
        <button key={g} className="btn-sm bg-blue-600 text-white">
          {g}
        </button>
      ))}
    </div>
  );
}

function CheckboxRow({
  label,
  items,
}: {
  label: string;
  items: string[];
}) {
  return (
    <div>
      <div className="text-white text-sm mb-1">{label}</div>
      <div className="flex flex-wrap gap-3">
        {items.map((i) => (
          <label key={i} className="flex items-center gap-1 text-white text-sm">
            <input type="checkbox" />
            {i}
          </label>
        ))}
      </div>
    </div>
  );
}
