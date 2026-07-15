import { Activity, ShieldCheck, TerminalSquare } from "lucide-react";
import Image from "next/image";
import { AgentTerminal } from "@/components/AgentTerminal";
import { serviceCatalog } from "@/lib/services/catalog";

export default function Home() {
  const services = Object.values(serviceCatalog);

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/">
          <Image src="/agentfund-logo.png" alt="AgentFund logo" width={56} height={40} priority />
          <span>AgentFund</span>
        </a>
        <nav>
          <a href="/api/asp/catalog">Catalog</a>
          <a href="#services">Services</a>
          <a href="#terminal">Terminal</a>
        </nav>
      </header>

      <section className="mast">
        <div>
          <p className="eyebrow">A2MCP ASP for OKX.AI on X Layer</p>
          <h1>Autonomous strategy intelligence, priced per call.</h1>
          <p className="lede">
            AgentFund gives OKX.AI agents a real paid service layer for market
            scans, trade signals, risk checks, NAV calculations, and public agent
            updates. Execution remains user controlled.
          </p>
          <div className="heroActions">
            <a href="#terminal">Open Terminal</a>
            <a href="/api/asp/catalog">View ASP Catalog</a>
          </div>
        </div>
        <div className="status">
          <Image src="/agentfund-logo.png" alt="" width={168} height={120} />
          <span>Payment receiver</span>
          <strong>0x0b95dF99653f9dA5cBdeaAbeb5B4110dE9D1073a</strong>
          <small>X Layer Mainnet · OKB</small>
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

      <section className="services" id="services">
        <h2>ASP Services</h2>
        <div className="serviceList">
          {services.map((service) => (
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

      <AgentTerminal services={services} />
    </main>
  );
}
