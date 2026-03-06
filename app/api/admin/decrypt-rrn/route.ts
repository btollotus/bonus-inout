import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const ALGORITHM = 'aes-256-gcm'
const SECRET_KEY = process.env.RRN_ENCRYPTION_KEY!

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  try {
    const { empId } = await req.json()
    if (!empId) return NextResponse.json({ error: 'empId 없음' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('employees')
      .select('encrypted_rrn')
      .eq('id', empId)
      .single()

    if (error || !data?.encrypted_rrn) return NextResponse.json({ error: '주민번호 없음' }, { status: 404 })

    const [ivHex, authTagHex, encryptedHex] = data.encrypted_rrn.split(':')
    const key = Buffer.from(SECRET_KEY, 'hex')
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return NextResponse.json({ rrn: decrypted.slice(0, 6) + '-' + decrypted.slice(6) })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '복호화 실패' }, { status: 500 })
  }
}