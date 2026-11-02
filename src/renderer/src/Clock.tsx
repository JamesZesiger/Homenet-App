import { useEffect, useState } from 'react'

function greeting(hour: number) {
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    // Tick on the minute boundary, then every minute.
    let timer = 0
    const tick = () => {
      setNow(new Date())
      timer = window.setTimeout(tick, 60000 - (Date.now() % 60000))
    }
    timer = window.setTimeout(tick, 60000 - (Date.now() % 60000))
    return () => clearTimeout(timer)
  }, [])
  return (
    <div className="clock">
      <span className="greeting">{greeting(now.getHours())}</span>
      <span className="time">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
      <span className="date">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span>
    </div>
  )
}
