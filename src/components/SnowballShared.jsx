export function MapArtwork({ type }) {
  if (type === 'world') {
    return (
      <svg className="mapArtwork worldArtwork" viewBox="0 0 1000 520" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <rect width="1000" height="520" rx="28" fill="rgba(9, 38, 68, 0.62)" />
        <path className="mapOceanLine" d="M0 150 C120 105 220 180 350 135 S620 90 780 145 S910 210 1000 155" />
        <path className="landShape" d="M92 126 C126 72 225 58 304 84 C358 102 389 143 371 182 C348 232 286 224 252 260 C218 298 231 360 194 391 C148 429 94 368 104 309 C112 263 59 239 64 187 C66 162 76 142 92 126Z" />
        <path className="landShape" d="M289 286 C337 264 385 288 397 332 C411 383 356 455 309 459 C266 463 260 413 276 376 C289 347 259 314 289 286Z" />
        <path className="landShape" d="M450 105 C500 68 574 75 623 103 C668 129 713 116 762 130 C819 147 862 190 855 229 C849 264 797 267 773 299 C752 327 775 368 734 385 C682 407 645 355 602 344 C558 333 519 366 482 338 C445 310 481 259 455 227 C429 194 400 143 450 105Z" />
        <path className="landShape" d="M617 235 C660 213 725 226 760 263 C802 308 784 380 723 394 C679 404 620 377 603 330 C590 293 584 252 617 235Z" />
        <path className="landShape" d="M781 368 C827 340 895 361 914 407 C933 455 883 489 826 476 C777 465 744 391 781 368Z" />
        <path className="landIsland" d="M390 93 C414 77 440 84 448 105 C427 118 405 116 390 93Z" />
      </svg>
    )
  }

  if (type === 'china') {
    return (
      <svg className="mapArtwork chinaArtwork" viewBox="0 0 720 520" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <rect width="720" height="520" rx="28" fill="rgba(11, 54, 60, 0.62)" />
        <path className="chinaLand" d="M115 168 C138 104 231 80 296 104 C332 116 362 88 410 91 C461 96 493 126 532 136 C584 149 625 186 618 232 C612 270 565 276 551 314 C535 358 578 390 531 424 C487 456 431 414 386 426 C333 440 296 491 242 466 C198 446 199 393 162 369 C116 338 75 296 91 239 C99 210 99 190 115 168Z" />
        <path className="chinaIsland" d="M564 360 C589 371 591 415 565 428 C546 413 546 381 564 360Z" />
        <path className="chinaIsland" d="M472 458 C496 454 512 470 505 489 C480 493 462 480 472 458Z" />
        <path className="mapProvinceLine" d="M176 166 C223 194 278 178 318 212 S421 238 488 207" />
        <path className="mapProvinceLine" d="M224 292 C285 266 360 290 405 331 S488 345 535 324" />
        <path className="mapProvinceLine" d="M352 118 C334 184 348 240 330 304 S318 394 286 448" />
      </svg>
    )
  }

  return (
    <svg className="mapArtwork localArtwork" viewBox="0 0 900 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="900" height="520" rx="28" fill="#cfe7d1" />
      <path d="M0 345 C130 300 214 374 328 326 C448 276 543 292 660 331 C759 364 829 335 900 305 L900 520 L0 520Z" fill="#8fcf8d" />
      <path d="M0 365 C112 335 210 385 330 356 C470 322 568 338 704 371 C790 392 846 378 900 355 L900 520 L0 520Z" fill="#d8c17e" opacity="0.78" />
      <path d="M548 0 L660 182 L618 182 L724 305 L387 305 L492 181 L455 181Z" fill="#6f8f88" />
      <path d="M622 30 L714 182 L681 182 L770 286 L520 286 L590 180 L558 180Z" fill="#5e7f7a" opacity="0.86" />
      <path d="M0 320 C80 292 150 326 214 307 C270 290 325 294 370 320 L370 520 L0 520Z" fill="#78b9e4" />
      <path d="M0 350 C92 326 162 360 238 336 C286 321 330 323 370 345" fill="none" stroke="#fff4cf" strokeWidth="22" strokeLinecap="round" opacity="0.95" />
      <path d="M380 520 C395 430 468 390 535 348 C617 297 637 236 708 205" fill="none" stroke="#d9b884" strokeWidth="30" strokeLinecap="round" />
      <path d="M380 520 C395 430 468 390 535 348 C617 297 637 236 708 205" fill="none" stroke="#f7e9b8" strokeWidth="16" strokeLinecap="round" strokeDasharray="18 14" />
      <rect x="430" y="282" width="92" height="66" rx="8" fill="#e7a26d" />
      <path d="M418 287 L476 238 L535 287Z" fill="#b95f52" />
      <rect x="552" y="312" width="84" height="62" rx="8" fill="#f0bd73" />
      <path d="M540 316 L594 270 L650 316Z" fill="#bf6a55" />
      <rect x="642" y="331" width="64" height="80" rx="8" fill="#8fb5c5" />
      <rect x="718" y="300" width="76" height="111" rx="8" fill="#7da0bc" />
      <circle cx="386" cy="226" r="44" fill="#65b66a" />
      <circle cx="326" cy="250" r="32" fill="#5fae65" />
      <circle cx="404" cy="272" r="30" fill="#78c47b" />
      <rect x="375" y="255" width="14" height="58" rx="7" fill="#8a5a34" />
      <path d="M225 330 C255 296 310 296 340 330 C312 348 252 348 225 330Z" fill="#9fcf70" />
      <path d="M245 366 C289 338 339 345 365 383 C324 398 280 394 245 366Z" fill="#94c761" />
    </svg>
  )
}

export function MapLandmarks({ type }) {
  return <MapArtwork type={type} />
}

export function NoticeModal({ title, text, onClose }) {
  return (
    <div className="noticeOverlay">
      <div className="noticeBox">
        <h2>{title}</h2>
        <p>{text}</p>
        <button onClick={onClose}>知道了</button>
      </div>
    </div>
  )
}

export function StatusPair({ icon, userLabel, userValue, catLabel, catValue }) {
  return (
    <div className="statusPair">
      <div className="statusIcon">{icon}</div>
      <div className="statusText">
        <small>{userLabel}</small>
        <strong>{userValue}</strong>
      </div>
      <div className="statusDivider" />
      <div className="statusText catStatusText">
        <small>{catLabel}</small>
        <strong>{catValue}</strong>
      </div>
    </div>
  )
}
