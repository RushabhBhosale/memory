export default function HomePage() {
  return (
    <main
      style={{
        margin: '0 auto',
        maxWidth: 760,
        padding: '64px 20px'
      }}
    >
      <h1 style={{ fontSize: 36, lineHeight: 1.1, margin: '0 0 16px' }}>
        Personal Memory API
      </h1>
      <p style={{ color: '#4b5563', fontSize: 18, lineHeight: 1.6 }}>
        This service provides API endpoints for saving, searching, retrieving,
        updating, and deleting personal memories.
      </p>
      <p>
        <a href="/privacy" style={{ color: '#2563eb', fontWeight: 700 }}>
          Privacy Policy
        </a>
      </p>
    </main>
  );
}
