"use client";

import Image from "next/image";

import { ALESSANDRA_BIRTHDAY_GIFT_URL } from "@/lib/birthday/alessandra-birthday.mjs";

import styles from "./alessandra-mobile-story.module.css";

export function AlessandraMobileStory() {
  return (
    <div className={styles.page} data-birthday-page="true">
      <div className={styles.canvas}>
        <section className={`${styles.card} ${styles.opener} ${styles.tiltLeft}`}>
          <div className={styles.cardBar}>
            <span>Private note</span>
            <span>04/02</span>
          </div>
          <h1 className={styles.title}>Happy 20th, Alessandra.</h1>
          <p className={styles.line}>You being 20 is actually rude.</p>
          <p className={styles.line}>I still think 2019 was two weeks ago.</p>
          <p className={styles.lineMuted}>Happy birthday!</p>
        </section>

        <section className={`${styles.card} ${styles.mediaCard}`}>
          <div className={styles.cardBar}>
            <span>Reaction image</span>
            <span>1/2</span>
          </div>
          <div className={`${styles.mediaFrame} ${styles.mediaFrameTall}`}>
            <Image
              fill
              priority
              alt="Bad Bunny covering his face and getting emotional at the Grammys."
              className={styles.mediaCover}
              sizes="(max-width: 480px) 92vw, 420px"
              src="/birthday/alessandra-20/bad-bunny-grammys.webp"
              style={{ objectPosition: "52% 34%" }}
            />
          </div>
          <p className={styles.caption}>Me trying to be normal after remembering you are 20 now.</p>
          <p className={styles.captionSub}>I did not approve that jump scare.</p>
        </section>

        <section className={`${styles.card} ${styles.photoCard} ${styles.tiltRight}`}>
          <div className={styles.cardBar}>
            <span>Caught in 4k</span>
            <span>evidence</span>
          </div>
          <div className={styles.photoLayout}>
            <div className={styles.photoFrame}>
              <Image
                fill
                alt="Tiny photo of Alessandra smiling in a bright green jersey."
                className={styles.mediaContain}
                sizes="112px"
                src="/birthday/alessandra-20/alessandra.png"
              />
            </div>
            <div className={styles.photoCopy}>
              <p className={styles.photoLead}>Caught in 4k.</p>
              <p className={styles.photoLine}>Huge smile.</p>
              <p className={styles.photoLine}>Sorry, this had to make the page.</p>
            </div>
          </div>
        </section>

        <section className={`${styles.card} ${styles.mediaCard}`}>
          <div className={styles.cardBar}>
            <span>Reaction image</span>
            <span>2/2</span>
          </div>
          <div className={`${styles.mediaFrame} ${styles.mediaFrameWide}`}>
            <Image
              fill
              alt="Crazy Squidward hovering over a sleeping SpongeBob."
              className={styles.mediaCover}
              sizes="(max-width: 480px) 92vw, 420px"
              src="/birthday/alessandra-20/crazy-squidward.jpg"
              style={{ objectPosition: "50% 50%" }}
            />
          </div>
          <p className={styles.caption}>
            Me watching you do school, swimming, flag football, family, community, and cooking like that is normal.
          </p>
          <p className={styles.captionSub}>Please relax for one day.</p>
        </section>

        <section className={`${styles.card} ${styles.realTalk}`}>
          <div className={styles.cardBar}>
            <span>Real talk</span>
            <span>short version</span>
          </div>
          <p className={styles.realLine}>You show up for your people.</p>
          <p className={styles.realLine}>You care hard and you do not fake it.</p>
          <p className={styles.realLine}>That is why being around you feels easy.</p>
        </section>

        <section className={`${styles.card} ${styles.giftCard}`}>
          <div className={styles.cardBar}>
            <span>One more thing</span>
            <span>open this</span>
          </div>
          <p className={styles.giftLead}>I got you something.</p>
          <p className={styles.giftText}>Small gift</p>
          <a
            className={styles.giftButton}
            href={ALESSANDRA_BIRTHDAY_GIFT_URL}
            rel="noreferrer noopener"
            target="_blank"
          >
            Claim your birthday gift
          </a>
          <p className={styles.giftFoot}>Open it before I add another paragraph.</p>
        </section>
      </div>
    </div>
  );
}
