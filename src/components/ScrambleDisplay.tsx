interface Props {
  moves: string[];
  /** Đánh dấu các nước đã "khớp" khi người dùng vặn theo scramble */
  className?: string;
  size?: 'lg' | 'md';
}

export default function ScrambleDisplay({ moves, className = '', size = 'lg' }: Props) {
  return (
    <p
      className={`font-mono leading-[1.55] tracking-tight text-ink-100 ${
        size === 'lg' ? 'text-[clamp(1rem,2.4vw,1.6rem)]' : 'text-sm'
      } ${className}`}
    >
      {moves.map((m, i) => (
        <span key={i} className="mr-[0.55em] inline-block whitespace-nowrap">
          {m}
        </span>
      ))}
    </p>
  );
}
