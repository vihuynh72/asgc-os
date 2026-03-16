import { PageShell } from "@/components/page-shell";
import { getPrivacyPolicyContent } from "@/lib/privacy-policy.mjs";

export default function PrivacyPage() {
  const content = getPrivacyPolicyContent();

  return (
    <PageShell title={content.title} description={content.description}>
      <div className="space-y-8 text-sm text-foreground/80">
        <p className="max-w-3xl text-pretty text-foreground/75">{content.intro}</p>

        {content.sections.map((section) => (
          <section key={section.id} id={section.id} className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
            <div className="space-y-2">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            {section.bullets?.length ? (
              <ul className="list-disc space-y-2 pl-5">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </PageShell>
  );
}
