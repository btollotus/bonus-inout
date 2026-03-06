import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const SECRET_KEY = process.env.RRN_ENCRYPTION_KEY!

export async function POST(req: NextRequest) {
  try {
    const { rrn } = await req.json()
    if (!rrn) return NextResponse.json({ error: '주민번호가 없습니다.' }, { status: 400 })
    if (!SECRET_KEY) return NextResponse.json({ error: 'RRN_ENCRYPTION_KEY 환경변수 없음' }, { status: 500 })

    const key = Buffer.from(SECRET_KEY, 'hex')
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    let encrypted = cipher.update(rrn, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const authTag = cipher.getAuthTag()

    const result = iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted
    return NextResponse.json({ encrypted: result })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '암호화 실패' }, { status: 500 })
  }
}