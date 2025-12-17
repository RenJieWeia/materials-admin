export interface Material {
  id: number;
  game_name: string;
  account_name: string;
  description: string | null;
  status: string;
  user: string | null;
  usage_time: string | null;
  created_at: string;
  updated_at: string;
}
