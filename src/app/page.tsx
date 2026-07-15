import { Activity, ShieldCheck, TerminalSquare } from "lucide-react";
import { serviceCatalog } from "@/lib/services/catalog";

export default function Home() {
  return (
    <main className="shell">
      <section className="mast">
        <div>
          <p className="eyebrow">A2MCP ASP for OKX.AI</p>
          <h1>AgentFund</h1>
          <p className="lede">
            Paid strategy intelligence for autonomous finance agents on X Layer:
            market scans, trade signals, risk checks, NAV calculations, and public
            agent updates.
          </p>
        </div>
        <div className="status">
          <span>Receiver</span>
          <strong>0x0b95...073a</strong>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <TerminalSquare aria-hidden />
          <h2>Marketplace Native</h2>
          <p>Every service is exposed as a fixed-price A2MCP call for OKX.AI agents.</p>
        </div>
        <div className="panel">
          <Activity aria-hidden />
          <h2>X Layer First</h2>
          <p>Services read live X Layer market and chain data before generating strategy output.</p>
        </div>
        <div className="panel">
          <ShieldCheck aria-hidden />
          <h2>User Controlled</h2>
          <p>AgentFund sells intelligence and risk checks. Users keep custody and approve execution.</p>
        </div>
      </section>

      <section className="services">
        <h2>ASP Services</h2>
        <div className="serviceList">
          {Object.values(serviceCatalog).map((service) => (
            <article className="service" key={service.id}>
              <div>
                <h3>{service.name}</h3>
                <p>{service.description}</p>
              </div>
              <span>${service.priceUsd}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
