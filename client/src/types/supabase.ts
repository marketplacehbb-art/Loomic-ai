export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            projects: {
                Row: {
                    id: string
                    user_id: string
                    name: string
                    description: string | null
                    code: string
                    prompt: string | null
                    thumbnail_url: string | null
                    status: 'draft' | 'published' | 'archived'
                    tags: string[] | null
                    views: number
                    is_public: boolean
                    created_at: string
                    updated_at: string
                    deleted_at: string | null
                    prompt_history: Json
                    template: string
                    thumbnail: string | null
                }
                Insert: {
                    id?: string
                    user_id?: string
                    name: string
                    description?: string | null
                    code: string
                    prompt?: string | null
                    thumbnail_url?: string | null
                    status?: 'draft' | 'published' | 'archived'
                    tags?: string[] | null
                    views?: number
                    is_public?: boolean
                    created_at?: string
                    updated_at?: string
                    deleted_at?: string | null
                    prompt_history?: Json
                    template?: string
                    thumbnail?: string | null
                }
                Update: {
                    id?: string
                    user_id?: string
                    name?: string
                    description?: string | null
                    code?: string
                    prompt?: string | null
                    thumbnail_url?: string | null
                    status?: 'draft' | 'published' | 'archived'
                    tags?: string[] | null
                    views?: number
                    is_public?: boolean
                    created_at?: string
                    updated_at?: string
                    deleted_at?: string | null
                    prompt_history?: Json
                    template?: string
                    thumbnail?: string | null
                }
            }
            user_profiles: {
                Row: {
                    id: string
                    user_id: string
                    full_name: string | null
                    username: string | null
                    bio: string | null
                    avatar_url: string | null
                    theme: 'light' | 'dark'
                    language: string
                    timezone: string
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    full_name?: string | null
                    username?: string | null
                    bio?: string | null
                    avatar_url?: string | null
                    theme?: 'light' | 'dark'
                    language?: string
                    timezone?: string
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    full_name?: string | null
                    username?: string | null
                    bio?: string | null
                    avatar_url?: string | null
                    theme?: 'light' | 'dark'
                    language?: string
                    timezone?: string
                    created_at?: string
                    updated_at?: string
                }
            }
            email_preferences: {
                Row: {
                    id: string
                    user_id: string
                    notify_2fa_recovery: boolean
                    notify_password_changed: boolean
                    notify_new_device: boolean
                    notify_suspicious_activity: boolean
                    notify_weekly_report: boolean
                    notify_generation_complete: boolean
                    notify_project_updates: boolean
                    notify_error_alerts: boolean
                    notify_newsletters: boolean
                    notify_product_updates: boolean
                    notify_promotions: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    notify_2fa_recovery?: boolean
                    notify_password_changed?: boolean
                    notify_new_device?: boolean
                    notify_suspicious_activity?: boolean
                    notify_weekly_report?: boolean
                    notify_generation_complete?: boolean
                    notify_project_updates?: boolean
                    notify_error_alerts?: boolean
                    notify_newsletters?: boolean
                    notify_product_updates?: boolean
                    notify_promotions?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    notify_2fa_recovery?: boolean
                    notify_password_changed?: boolean
                    notify_new_device?: boolean
                    notify_suspicious_activity?: boolean
                    notify_weekly_report?: boolean
                    notify_generation_complete?: boolean
                    notify_project_updates?: boolean
                    notify_error_alerts?: boolean
                    notify_newsletters?: boolean
                    notify_product_updates?: boolean
                    notify_promotions?: boolean
                    created_at?: string
                    updated_at?: string
                }
            }
            project_messages: {
                Row: {
                    id: string
                    project_id: string
                    role: 'user' | 'assistant' | 'system'
                    content: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    project_id: string
                    role: 'user' | 'assistant' | 'system'
                    content: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    project_id?: string
                    role?: 'user' | 'assistant' | 'system'
                    content?: string
                    created_at?: string
                }
            }
            project_files: {
                Row: {
                    id: string
                    project_id: string
                    filename: string
                    content: string | null
                    storage_path: string | null
                    file_type: string | null
                    size_bytes: number | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    project_id: string
                    filename: string
                    content?: string | null
                    storage_path?: string | null
                    file_type?: string | null
                    size_bytes?: number | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    project_id?: string
                    filename?: string
                    content?: string | null
                    storage_path?: string | null
                    file_type?: string | null
                    size_bytes?: number | null
                    created_at?: string
                }
            }
        }
    }
}
