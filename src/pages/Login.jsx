import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Login() {

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')

  async function fazerLogin(e) {
    e.preventDefault()

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha
    })

    if (error) {
  console.log(error)
  setErro(error.message)
  return
}

    window.location.href = '/dashboard'
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: '#0f172a'
    }}>
      <form
        onSubmit={fazerLogin}
        style={{
          background: '#111827',
          padding: '40px',
          borderRadius: '16px',
          width: '350px',
          display: 'flex',
          flexDirection: 'column',
          gap: '15px'
        }}
      >
        <h1 style={{ color: 'white', textAlign: 'center' }}>
          Nexus Pro
        </h1>

        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            padding: '12px',
            borderRadius: '10px',
            border: 'none'
          }}
        />

        <input
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          style={{
            padding: '12px',
            borderRadius: '10px',
            border: 'none'
          }}
        />

        {erro && (
          <span style={{ color: 'red' }}>
            {erro}
          </span>
        )}

        <button
          type="submit"
          style={{
            padding: '12px',
            borderRadius: '10px',
            border: 'none',
            background: '#2563eb',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          Entrar
        </button>
      </form>
    </div>
  )
}