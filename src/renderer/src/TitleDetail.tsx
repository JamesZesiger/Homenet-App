import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TitleDetail } from '../../shared/types'
import { Dialog } from './Dialog'

// A movie or show: artwork, name, description, and Play on each service that
// streams it. Play opens the title on the service's site inside homeapp.
export function TitleDetailDialog({ titleKey, names, onClose, onPlayed }: {
  titleKey: string
  // Provider id -> display name.
  names: Map<string, string>
  onClose: () => void
  onPlayed: () => void
}) {
  const [title, setTitle] = useState<TitleDetail>()
  const [opening, setOpening] = useState<string | null>(null)
  useEffect(() => {
    window.homeapp.title(titleKey).then(setTitle)
  }, [titleKey])

  const play = async (service: string) => {
    setOpening(service)
    await window.homeapp.play(titleKey, service)
    onPlayed()
  }

  // Portalled to <body>: the search modal's backdrop blur would otherwise
  // confine this full-screen layer to the modal's box.
  return createPortal(
    <Dialog className="title-detail" label={title?.name ?? 'Title'} onClose={onClose}>
      {title && (
        <>
          {title.backdrop && <img className="backdrop" src={title.backdrop} alt="" />}
          <div className="detail-body">
            {title.poster && <img className="detail-poster" src={title.poster} alt="" />}
            <div className="detail-text">
              <h2>{title.name}</h2>
              <p className="row-sub">{[title.year, title.type === 'tv' ? 'Series' : 'Movie'].filter(Boolean).join(' · ')}</p>
              <p className="overview">{title.overview || 'No description available.'}</p>
              <div className="actions">
                {title.services.map((s, i) => (
                  <button key={s} className="primary" autoFocus={i === 0} disabled={opening !== null} onClick={() => play(s)}>
                    {opening === s ? 'Opening…' : `▶ Play on ${names.get(s) ?? s}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </Dialog>,
    document.body,
  )
}
