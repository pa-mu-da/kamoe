# Supabase データベースセットアップ手順

このゲーム（電気椅子ゲーム）をオンラインで動作させるためには、Supabase のセットアップが必要です。以下の手順に従ってテーブルを作成し、リアルタイム機能を有効にしてください。

## 1. Supabase プロジェクトの作成
[Supabase Console](https://app.supabase.com/) にログインし、新しいプロジェクトを作成してください。

## 2. テーブルの作成
SQL Editor で以下の SQL を実行して、`rooms` テーブルを作成します。

```sql
create table public.rooms (
  id uuid default gen_random_uuid() primary key,
  code text not null unique,
  state jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- テーブルのリアルタイム機能を有効にする
alter publication supabase_realtime add table rooms;

-- 行レベルセキュリティ (RLS) を無効にする（デモ用。本番では適切に設定してください）
alter table rooms disable row level security;
```

## 3. 環境変数の設定
プロジェクトのルートディレクトリに `.env.local` ファイルを作成し、Supabase の URL と Anon Key を設定してください。

```text
VITE_SUPABASE_URL=あなたのSupabaseプロジェクトURL
VITE_SUPABASE_ANON_KEY=あなたのSupabase Anon Key
```

URL と Key は Supabase の Project Settings > API から取得できます。

## 4. アプリケーションの実行
以下のコマンドで開発サーバーを起動します。

```

## 5. 1時間以上放置された部屋の自動削除設定（推奨）
以下のSQLをSQL Editorで実行することで、1時間操作がなかった部屋を自動的にクリーンアップできます。

### A. 最終更新日時の自動更新設定
```sql
-- 自動更新用関数の作成
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- テーブルが更新されるたびに updated_at を自動更新するトリガー
DROP TRIGGER IF EXISTS update_rooms_modtime ON rooms;
CREATE TRIGGER update_rooms_modtime
    BEFORE UPDATE ON rooms
    FOR EACH ROW
    EXECUTE PROCEDURE update_modified_column();
```

### B. 自動削除スケジュール設定 (pg_cron)
SupabaseのExtensionsで `pg_cron` を有効にしている場合のみ実行してください。
```sql
SELECT cron.schedule('delete-old-rooms', '*/10 * * * *', $$
  DELETE FROM rooms WHERE updated_at < NOW() - INTERVAL '1 hour';
$$);
```
※ `pg_cron` が使えない場合は、アプリが新しいルームを作成する際に古いルームを削除する処理がコードに含まれています。
