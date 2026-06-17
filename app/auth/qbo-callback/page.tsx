/**
 * QuickBooks OAuth redirect target. Lives under /auth/* so the portal middleware leaves it
 * PUBLIC (an Intuit redirect carries no session). It does NOT exchange the code — it just shows
 * the `code` + `realmId` so the operator can hand them back to complete the token exchange
 * server-side (the tokens live in shared.state_documents, written by the worker/CLI, not the
 * portal). Code is single-use and expires in ~10 min.
 */
export default async function QboCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const code = sp.code ?? "";
  const realmId = sp.realmId ?? "";
  const error = sp.error ?? sp.error_description ?? "";

  const box: React.CSSProperties = {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    background: "#0a2c4e", color: "#fff", padding: "10px 14px",
    borderRadius: 8, wordBreak: "break-all", fontSize: 13, margin: "6px 0 16px",
  };
  return (
    <div style={{ maxWidth: 620, margin: "64px auto", padding: "0 20px", fontFamily: "system-ui, sans-serif", color: "#1f2937" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: "#0a2c4e" }}>QuickBooks authorization</h1>
      {error ? (
        <p style={{ color: "#b91c1c" }}>Authorization error: {error}. Re-open the authorize link and try again.</p>
      ) : code ? (
        <>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            Authorized. Copy <b>both values below</b> back to complete the connection (the code expires in ~10 minutes):
          </p>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: "#64748b" }}>realmId (company)</div>
          <div style={box}>{realmId || "(missing)"}</div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: "#64748b" }}>code</div>
          <div style={box}>{code}</div>
          <p style={{ fontSize: 13, color: "#64748b" }}>Paste these two values into the chat and I’ll store the tokens, then authorize the next company.</p>
        </>
      ) : (
        <p style={{ fontSize: 14 }}>No authorization code in the URL. Open the authorize link, pick a company, and click Authorize.</p>
      )}
    </div>
  );
}
