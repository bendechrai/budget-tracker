import Link from "next/link";
import Image from "next/image";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.badge}>Personal Finance</p>
          <h1 className={styles.headline}>
            Never be caught off guard
            <br className={styles.brDesktop} /> by a bill again
          </h1>
          <p className={styles.subheadline}>
            Sinking Fund calculates exactly what to set aside each pay cycle so
            every obligation is covered before it hits.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/signup" className={styles.primaryCta}>
              Get started
            </Link>
            <Link href="/login" className={styles.secondaryCta}>
              Log in
            </Link>
          </div>
        </div>
      </header>

      <section className={styles.showcase}>
        <div className={styles.showcaseInner}>
          <div className={styles.screenshotFrame}>
            <Image
              src="/dashboard-light.png"
              alt="Sinking Fund dashboard showing fund health, projected balances, and upcoming obligations"
              width={1145}
              height={833}
              className={`${styles.screenshot} ${styles.screenshotLight}`}
              priority
            />
            <Image
              src="/dashboard-dark.png"
              alt="Sinking Fund dashboard in dark mode"
              width={1145}
              height={833}
              className={`${styles.screenshot} ${styles.screenshotDark}`}
              priority
            />
          </div>
        </div>
      </section>

      <section className={styles.features}>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>
            Everything you need to stay ahead of your bills
          </h2>
          <div className={styles.featureGrid}>
            <div className={styles.featureCard}>
              <h3 className={styles.featureHeading}>
                Smart fund calculations
              </h3>
              <p className={styles.featureDescription}>
                Adaptive per-cycle contributions that ramp up or down based on
                when each obligation is due. No manual spreadsheet math.
              </p>
            </div>
            <div className={styles.featureCard}>
              <h3 className={styles.featureHeading}>Bank statement import</h3>
              <p className={styles.featureDescription}>
                Upload PDF, CSV, or OFX statements. AI-powered parsing detects
                your recurring income and expenses automatically.
              </p>
            </div>
            <div className={styles.featureCard}>
              <h3 className={styles.featureHeading}>
                Natural language control
              </h3>
              <p className={styles.featureDescription}>
                Type &ldquo;Add Netflix $22.99 monthly&rdquo; and it just works.
                Create, edit, and query your finances in plain English.
              </p>
            </div>
            <div className={styles.featureCard}>
              <h3 className={styles.featureHeading}>
                Projections &amp; what-if
              </h3>
              <p className={styles.featureDescription}>
                See your fund balance projected months ahead. Toggle obligations
                on and off to model different scenarios instantly.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.howItWorks}>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>How it works</h2>
          <div className={styles.stepsGrid}>
            <div className={styles.step}>
              <span className={styles.stepNumber}>1</span>
              <h3 className={styles.stepTitle}>Upload your statements</h3>
              <p className={styles.stepDescription}>
                Import bank statements in PDF, CSV, or OFX format. No bank
                login required&mdash;your credentials stay yours.
              </p>
            </div>
            <div className={styles.step}>
              <span className={styles.stepNumber}>2</span>
              <h3 className={styles.stepTitle}>Review detected patterns</h3>
              <p className={styles.stepDescription}>
                We automatically find recurring income and expenses. Confirm the
                ones you want to track and set up your sinking fund.
              </p>
            </div>
            <div className={styles.step}>
              <span className={styles.stepNumber}>3</span>
              <h3 className={styles.stepTitle}>See what to set aside</h3>
              <p className={styles.stepDescription}>
                Your dashboard shows exactly how much to save each pay cycle.
                Watch your fund health stay green as obligations approach.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className={styles.sectionInner}>
          <h2 className={styles.finalCtaHeading}>
            Ready to stop worrying about bills?
          </h2>
          <p className={styles.finalCtaDescription}>
            No bank connections required. No credit card needed. Your financial
            data stays on your terms.
          </p>
          <Link href="/signup" className={styles.primaryCta}>
            Get started for free
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <p className={styles.footerText}>Sinking Fund</p>
      </footer>
    </div>
  );
}
