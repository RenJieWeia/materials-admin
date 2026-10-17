/** How duplicates are handled for one import batch. */
export type DuplicatePolicy = "manual" | "keep_new" | "cancel";

export const DUPLICATE_POLICY_LABELS: Record<DuplicatePolicy, string> = {
  manual: "仅隔离，稍后手动处理",
  keep_new: "自动保留新数据",
  cancel: "自动取消重复导入",
};

export interface Material {
  id: number;
  game_name: string;
  account_name: string;
  description: string | null;
  status: string;
  user: string | null;
  user_real_name?: string | null;
  usage_time: string | null;
  created_at: string;
  updated_at: string;
}
