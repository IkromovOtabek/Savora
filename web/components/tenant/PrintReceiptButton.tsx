'use client';

export default function PrintReceiptButton() {
  return (
    <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
      Chop etish
    </button>
  );
}
