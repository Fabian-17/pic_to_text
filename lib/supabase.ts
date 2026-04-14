import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type Database = {
  public: {
    Tables: {
      receipts: {
        Row: {
          id: string;
          user_id: string;
          image_url: string;
          extracted_text: string | null;
          quality_score: number | null;
          quality_issues: string[] | null;
          status: 'processing' | 'done' | 'failed';
          parsed_amount: number | null;
          parsed_date: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['receipts']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['receipts']['Insert']>;
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
    };
  };
};
