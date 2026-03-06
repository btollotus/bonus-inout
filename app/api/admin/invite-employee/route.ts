import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  try {
    const { email, name } = await req.json()
    if (!email) return NextResponse.json({ error: '이메일이 필요합니다.' }, { status: 400 })

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { name },
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/accept-invite`,
    })

    if (error) {
      // 이미 존재하는 계정이면 userId 반환
      if (error.message.includes('already been registered')) {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers()
        const found = list.users.find((u) => u.email === email)
        if (found) return NextResponse.json({ userId: found.id, alreadyExists: true })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ userId: data.user?.id })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '오류' }, { status: 500 })
  }
}
