'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createShop,
  upsertShopFixedCast,
  upsertShopNgCast,
  type ShopDrinkPreference,
  type ShopGenre,
} from '@/lib/api.shops';

const GENRES = [
  { value: 'club', label: 'クラブ' },
  { value: 'cabaret', label: 'キャバクラ' },
  { value: 'snack', label: 'スナック' },
  { value: 'gb', label: 'GB' },
] as const;

const DRINK_LEVEL_MIN = [
  { value: 'none', label: '飲めない' },
  { value: 'weak', label: '弱い' },
  { value: 'ok', label: '普通' },
] as const;

const DRINK_LEVEL_POLICY = [
  { value: 'none', label: '不要' },
  { value: 'weak', label: '弱め' },
  { value: 'normal', label: '普通' },
  { value: 'strong', label: '強い' },
] as const;

const ID_REQUIREMENT = [
  { value: 'face_photo_only', label: '顔写真のみ' },
  { value: 'residence_only', label: '住民票のみ' },
  { value: 'both', label: '両方' },
] as const;

const AGE_BAND = [
  { value: '18-19', label: '18–19' },
  { value: '20-24', label: '20–24' },
  { value: '25-30', label: '25–30' },
  { value: '30-50', label: '30–50' },
] as const;

const formSchema = z.object({
  // 基本情報
  name: z.string().min(1, '店舗名は必須です'),
  shopNumber: z
    .string()
    .trim()
    .regex(/^\d{3,4}$/, { message: '半角数字3〜4桁の数字を入力してください' })
    .optional()
    .or(z.literal('')),
  prefecture: z.string().trim().optional().default(''),
  city: z.string().trim().optional().default(''),
  addressLine: z.string().trim().optional().default(''),
  phone: z.string().trim().optional().default(''),

  // 追加要件（③④⑤⑥⑦⑧）
  genre: z.enum(GENRES.map(g => g.value) as [string, ...string[]]),
  hourlyBaseline: z
    .number({ invalid_type_error: '数値を入力してください' })
    .min(0)
    .refine(v => v % 500 === 0, '500円刻みで入力'),
  drinkLevelMin: z.enum(DRINK_LEVEL_MIN.map(d => d.value) as [string, ...string[]]),
  drinkLevelPolicy: z.enum(
    DRINK_LEVEL_POLICY.map(d => d.value) as [string, ...string[]],
  ),
  idRequirement: z.enum(ID_REQUIREMENT.map(i => i.value) as [string, ...string[]]),
  ageBand: z.enum(AGE_BAND.map(a => a.value) as [string, ...string[]]),
  requiredHeadcount: z
    .number({ invalid_type_error: '数値を入力してください' })
    .int()
    .min(0),

  // ①専属指名キャスト（userId想定）
  exclusiveCastId: z.string().uuid('UUID形式で入力').optional().or(z.literal('')),

  // ②NGキャスト（カンマ区切りでUUID複数）
  ngCastIds: z
    .string()
    .trim()
    .optional()
    .transform(v =>
      (v ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    ),

  // ⑧担当者（users.id）
  assignedStaffId: z.string().uuid('UUID形式で入力').optional().or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

export default function NewShopPage() {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      shopNumber: '',
      prefecture: '',
      city: '',
      addressLine: '',
      phone: '',
      genre: 'club',
      hourlyBaseline: 2500,
      drinkLevelMin: 'ok',
      drinkLevelPolicy: 'normal',
      idRequirement: 'both',
      ageBand: '20-24',
      requiredHeadcount: 1,
      exclusiveCastId: '',
      ngCastIds: [],
      assignedStaffId: '',
    },
  });

  // 数値input ←→ number 変換
  const numberBind = (name: keyof Pick<FormValues, 'hourlyBaseline' | 'requiredHeadcount'>) => ({
    value: String(watch(name) ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const n = Number(e.target.value);
      setValue(name as any, Number.isNaN(n) ? ('' as any) : (n as any), { shouldValidate: true });
    },
  });

const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    try {
      const preferredAgeRange = (() => {
        switch (data.ageBand) {
          case '18-19':
            return 'age_18_19';
          case '20-24':
            return 'age_20_24';
          case '25-30':
            return 'age_25_29';
          case '30-50':
            return 'age_30_34';
          default:
            return undefined;
        }
      })();

      const idDocumentRequirement = (() => {
        switch (data.idRequirement) {
          case 'face_photo_only':
            return 'photo_only';
          case 'residence_only':
            return 'address_only';
          case 'both':
            return 'both';
          default:
            return undefined;
        }
      })();

      const shop = await createShop({
        name: data.name,
        shopNumber: data.shopNumber?.trim() || null,
        prefecture: data.prefecture || null,
        city: data.city || null,
        addressLine: data.addressLine || null,
        phone: data.phone || null,
        genre: (data.genre as ShopGenre) || null,
        drinkPreference:
          (data.drinkLevelPolicy as ShopDrinkPreference) || null,
        idDocumentRequirement,
        preferredAgeRange,
        wageLabel: `${data.hourlyBaseline}円〜`,
      });

      if (data.exclusiveCastId) {
        await upsertShopFixedCast(shop.id, {
          castId: data.exclusiveCastId,
        });
      }

      const ngCastIds = Array.isArray(data.ngCastIds) ? data.ngCastIds : [];
      if (ngCastIds.length > 0) {
        await Promise.allSettled(
          ngCastIds.map((castId) =>
            upsertShopNgCast(shop.id, { castId }),
          ),
        );
      }

      alert('新規店舗を登録しました。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold">新規店舗登録</h1>
      <p className="text-sm text-gray-500 mt-2">店舗情報を入力して登録してください。</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-8">
        {/* 基本情報 */}
        <section>
          <h2 className="text-lg font-medium mb-4">基本情報</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-sm">店舗名 *</span>
              <input className="input" placeholder="店名" {...register('name')} />
              {errors.name && <p className="error">{errors.name.message}</p>}
            </label>

            <label className="space-y-1">
              <span className="text-sm">呼出番号（3〜4桁）</span>
              <input className="input" placeholder="例: 123 / 0123" {...register('shopNumber')} />
              {errors.shopNumber && <p className="error">{errors.shopNumber.message as any}</p>}
            </label>

            <label className="space-y-1">
              <span className="text-sm">都道府県</span>
              <input className="input" placeholder="福岡県" {...register('prefecture')} />
            </label>

            <label className="space-y-1">
              <span className="text-sm">市区町村</span>
              <input className="input" placeholder="福岡市…" {...register('city')} />
            </label>

            <label className="sm:col-span-2 space-y-1">
              <span className="text-sm">住所（番地以降）</span>
              <input className="input" placeholder="…" {...register('addressLine')} />
            </label>

            <label className="sm:col-span-2 space-y-1">
              <span className="text-sm">電話番号</span>
              <input className="input" placeholder="090-XXXX-XXXX" {...register('phone')} />
            </label>
          </div>
        </section>

        {/* 業態・要件 */}
        <section>
          <h2 className="text-lg font-medium mb-4">業態・要件</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-sm">ジャンル *</span>
              <select className="input" {...register('genre')}>
                {GENRES.map(g => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm">ベース時給（500円刻み） *</span>
              <input className="input" type="number" step={500} min={0} {...numberBind('hourlyBaseline')} />
              {errors.hourlyBaseline && <p className="error">{errors.hourlyBaseline.message as any}</p>}
            </label>

            <label className="space-y-1">
              <span className="text-sm">最低飲酒レベル *</span>
              <select className="input" {...register('drinkLevelMin')}>
                {DRINK_LEVEL_MIN.map(d => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm">飲酒ポリシー *</span>
              <select className="input" {...register('drinkLevelPolicy')}>
                {DRINK_LEVEL_POLICY.map(d => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm">身分証 *</span>
              <select className="input" {...register('idRequirement')}>
                {ID_REQUIREMENT.map(i => (
                  <option key={i.value} value={i.value}>
                    {i.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm">年齢帯 *</span>
              <select className="input" {...register('ageBand')}>
                {AGE_BAND.map(a => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm">必要人数 *</span>
              <input className="input" type="number" min={0} step={1} {...numberBind('requiredHeadcount')} />
              {errors.requiredHeadcount && <p className="error">{errors.requiredHeadcount.message as any}</p>}
            </label>
          </div>
        </section>

        {/* キャスト / 担当者 */}
        <section>
          <h2 className="text-lg font-medium mb-4">キャスト / 担当者</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-sm">専属指名キャスト（UUID）</span>
              <input className="input" placeholder="cast userId (UUID)" {...register('exclusiveCastId')} />
              {errors.exclusiveCastId && <p className="error">{errors.exclusiveCastId.message as any}</p>}
            </label>

            <label className="space-y-1">
              <span className="text-sm">NGキャスト（UUIDをカンマ区切りで複数）</span>
              <input
                className="input"
                placeholder="uuid1, uuid2, …"
                {...register('ngCastIds' as any)}
              />
            </label>

            <label className="sm:col-span-2 space-y-1">
              <span className="text-sm">担当者（users.id / UUID）</span>
              <input className="input" placeholder="staff userId (UUID)" {...register('assignedStaffId')} />
              {errors.assignedStaffId && <p className="error">{errors.assignedStaffId.message as any}</p>}
            </label>
          </div>
        </section>

        <div className="pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 text-white px-5 py-2.5 disabled:opacity-50"
          >
            {submitting ? '送信中…' : '登録確定'}
          </button>
        </div>
      </form>

      {/* ざっくりCSS */}
      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid rgba(0,0,0,.15);
          padding: 10px 12px;
          border-radius: 8px;
          background: rgba(255,255,255,.9);
        }
        .error {
          color: #dc2626;
          font-size: 12px;
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
}
