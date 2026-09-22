'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './loading.module.css';

export default function LoadingPage() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [complete, setComplete] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  
  const fullText = 'X-CEED';

  useEffect(() => {
    let typingTimeout;
    let fadeOutTimeout;

    if (text.length < fullText.length) {
      typingTimeout = setTimeout(() => {
        setText(fullText.substring(0, text.length + 1));
      }, 100); 
    } else {      
      setComplete(true);
      fadeOutTimeout = setTimeout(() => {
        setFadeOut(true);
        // Redirect after slide-up animation completes
        const redirectTimeout = setTimeout(() => {
          router.replace('/landing');
        }, 600); 
        return () => clearTimeout(redirectTimeout);
      }, 1000); 
    }

    return () => {
      clearTimeout(typingTimeout);
      clearTimeout(fadeOutTimeout);
    };
  }, [text, router]);

  return (
    <div className={`${styles.container} ${fadeOut ? styles.fadeOut : ''}`}>
      <div className={styles.content}>
        <h1 className={styles.title}>
          {text}
          <span className={`${styles.cursor} ${complete ? styles.cursorHidden : ''}`}></span>
        </h1>
      </div>
    </div>
  );
}