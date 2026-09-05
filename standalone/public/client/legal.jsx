import React, { useEffect, useState } from "react";

// Plain-language terms, privacy notice and community rules. These are written to
// be honest about what Gahookz actually does rather than to look like a large
// product's boilerplate, and they are deliberately short enough that somebody
// might read them. They have not been reviewed by a lawyer; see the notice at
// the foot of the page.

const DOCUMENTS = Object.freeze([
  { id: "rules", title: "Community rules", summary: "What is and is not welcome in a room." },
  { id: "terms", title: "Terms of use", summary: "The deal: the game is free, provided as-is, and can end at any time." },
  { id: "privacy", title: "Privacy", summary: "What is stored, for how long, and how to get rid of it." },
  { id: "contact", title: "Contact and takedown", summary: "How to report something or ask for content to be removed." }
]);

const DOCUMENT_IDS = new Set(DOCUMENTS.map((doc) => doc.id));

function selectedFromUrl() {
  const hash = window.location.hash.replace(/^#/, "").toLowerCase();
  return DOCUMENT_IDS.has(hash) ? hash : "rules";
}

export function LegalHub() {
  const [active, setActive] = useState(selectedFromUrl);

  useEffect(() => {
    const sync = () => setActive(selectedFromUrl());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const open = (id) => {
    if (!DOCUMENT_IDS.has(id)) return;
    window.history.pushState(null, "", "/legal#" + id);
    setActive(id);
    window.scrollTo({ top: 0, behavior: "auto" });
    requestAnimationFrame(() => document.getElementById("legal-title")?.focus());
  };

  const doc = DOCUMENTS.find((item) => item.id === active) || DOCUMENTS[0];

  return (
    <main className="information-page">
      <header className="information-header">
        <a className="information-brand" href="/">Gahookz</a>
        <div>
          <span>Playing fair</span>
          <h1>Rules, terms and privacy</h1>
          <p>Short, plain versions of the things you would normally never read.</p>
        </div>
        <a className="information-home-link" href="/">Back to game</a>
      </header>

      <div className="information-layout">
        <aside className="information-index">
          <h2>Documents</h2>
          <nav aria-label="Legal documents">
            {DOCUMENTS.map((item) =>
              <button
                type="button"
                key={item.id}
                className={item.id === active ? "is-active" : ""}
                aria-current={item.id === active ? "page" : undefined}
                onClick={() => open(item.id)}>
                <strong>{item.title}</strong><small>{item.summary}</small>
              </button>)}
          </nav>
        </aside>

        <article className="information-report" aria-labelledby="legal-title">
          <header className="information-report-heading">
            <span>Last updated 6 September 2026</span>
            <h2 id="legal-title" tabIndex="-1">{doc.title}</h2>
            <p>{doc.summary}</p>
          </header>
          <DocumentBody id={active} />
          <section className="information-section">
            <p className="account-privacy-note">
              Gahookz is made by one person for friends and small groups. These documents are
              written in good faith and in plain English, but they have not been reviewed by a
              lawyer. If you are relying on Gahookz for anything that matters, don't.
            </p>
          </section>
        </article>
      </div>
    </main>
  );
}

function DocumentBody({ id }) {
  if (id === "terms") return <Terms />;
  if (id === "privacy") return <Privacy />;
  if (id === "contact") return <Contact />;
  return <Rules />;
}

function Section({ title, children }) {
  return <section className="information-section"><h3>{title}</h3>{children}</section>;
}

function Rules() {
  return (
    <>
      <section className="information-verdict">
        <strong>A room is somebody's living room. Behave like it.</strong>
        <p>Gahookz gives you a blank box and asks you to be funny. That only works if nobody has to brace themselves before reading the screen.</p>
      </section>

      <Section title="Don't put these in a room">
        <ul className="information-list">
          <li>Content that attacks people for who they are — race, religion, disability, gender, sexuality or anything else in that family.</li>
          <li>Sexual content involving minors, or anything sexualising a real person who has not agreed to it.</li>
          <li>Threats, targeted harassment, or sharing somebody's private information.</li>
          <li>Real people's names, photos or voices used to humiliate them.</li>
          <li>Content that is illegal where you or the host are.</li>
          <li>Other people's copyrighted work presented as yours.</li>
        </ul>
      </Section>

      <Section title="The host decides">
        <p>
          Whoever created the room is in charge of it. A host can remove any message, drawing,
          answer or uploaded picture, reset a player's name and avatar, and kick or ban somebody
          from the room. Hosts are expected to use those controls rather than let a room get ugly.
        </p>
        <p>
          If something in a room is not okay, use the report button. The host sees it. Reports
          are private — other players are not told who raised one.
        </p>
      </Section>

      <Section title="Age">
        <p>
          Gahookz has no age verification and no content filtering. Rooms are private and made by
          whoever you share the code with, so what appears in one is entirely down to the people
          in it. It is not designed for children, and it should not be handed to a group of them
          unsupervised.
        </p>
      </Section>
    </>
  );
}

function Terms() {
  return (
    <>
      <section className="information-verdict">
        <strong>Free, as-is, and it might break.</strong>
        <p>There is no company here, no contract, and no promise that the game will be running tomorrow.</p>
      </section>

      <Section title="What you get">
        <ul className="information-list">
          <li>You can play without an account. You do not have to sign up for anything.</li>
          <li>An optional account stores career statistics and saved custom Gahooks. It never affects whether or how well you can play.</li>
          <li>The game is provided as-is, with no warranty of any kind. It may be unavailable, lose your room, or change without notice.</li>
        </ul>
      </Section>

      <Section title="Rooms end">
        <p>
          A room lives inside one server process. If that process restarts — for an update, a
          crash, or a power cut — every room on it ends immediately and cannot be recovered. Do not
          use Gahookz for anything you would be upset to lose. Updates are normally applied while
          the server waits for games in progress to finish, but that is a courtesy, not a promise.
        </p>
      </Section>

      <Section title="What you write stays yours">
        <p>
          You keep ownership of the questions, answers, drawings and images you make. By putting
          them in a room you allow them to be shown to the other people in that room for as long
          as the room exists. Nothing is published anywhere else, and nothing is used to train
          anything.
        </p>
      </Section>

      <Section title="Being asked to leave">
        <p>
          A host can remove you from their room. If you use Gahookz to harass people or to
          distribute illegal content, your access can be blocked entirely. There is no appeals
          process; this is a small hobby project, not a platform with a moderation department.
        </p>
      </Section>
    </>
  );
}

function Privacy() {
  return (
    <>
      <section className="information-verdict">
        <strong>Guest play stores nothing about you on the server beyond the life of the room.</strong>
        <p>No analytics, no advertising, no third-party trackers, no profile built about you.</p>
      </section>

      <Section title="If you play as a guest">
        <ul className="information-list">
          <li><strong>Held in memory while the room exists:</strong> the display name and avatar you chose, your score, and the questions, answers, chat, drawings and images you put in the room.</li>
          <li><strong>Held in your own browser:</strong> a random key identifying your seat in the room, your display preferences, and — for the current tab only — a room password if you entered one. None of this is sent anywhere except to the game server.</li>
          <li><strong>All of it disappears</strong> when the room ends, which happens a few minutes after everyone leaves, or immediately when the server restarts. There is no backup.</li>
        </ul>
      </Section>

      <Section title="If you sign in">
        <p>Signing in with Google is optional and only unlocks cosmetic extras. If you do:</p>
        <ul className="information-list">
          <li>Google tells us your account identifier, display name, email address and profile picture URL. Your password is never seen by Gahookz.</li>
          <li>We keep that, your career statistics, and any custom Gahooks you save, until you delete the account.</li>
          <li>The session cookie is opaque, marked HttpOnly and Secure, and holds no personal information.</li>
        </ul>
        <p>
          Ask us to delete your account and everything linked to it is removed — identity,
          sessions, statistics, unlocks and saved Gahooks. Ask and we will also send you a copy of
          what is stored.
        </p>
      </Section>

      <Section title="Logs">
        <p>
          The web server keeps ordinary access logs, which include IP addresses, for a short period
          so that abuse and faults can be investigated. Passwords, room credentials, session
          cookies and uploaded media are never written to them.
        </p>
      </Section>
    </>
  );
}

function Contact() {
  return (
    <>
      <Section title="Reporting something in a room">
        <p>
          Use the report button in the room. It goes straight to the host, who can remove the
          content or the player. This is the fastest route by a wide margin, because the host is
          in the room right now and we are not.
        </p>
      </Section>

      <Section title="Copyright and takedown">
        <p>
          If something in Gahookz is yours and should not be here, get in touch and describe what
          it is and where it appeared. Because rooms are temporary and hold no long-term copy of
          what players type, the content has usually already ceased to exist by the time a report
          arrives — but persistent items such as saved custom Gahooks can be removed.
        </p>
      </Section>

      <Section title="Privacy requests">
        <p>
          To get a copy of your account data or have it deleted, contact us from the email address
          attached to the account.
        </p>
      </Section>

      <Section title="How to reach us">
        <p>
          Through the contact details on <a href="/">the site owner's homepage</a>. This is a
          hobby project run by one person, so a reply may take a few days.
        </p>
      </Section>
    </>
  );
}
