export function SectionBox({ title, children, badge }) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="card-header">
        <span className="card-title">{title}</span>
        {badge}
      </div>
      {children}
    </div>
  )
}
