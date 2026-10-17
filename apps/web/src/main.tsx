import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/noto-sans-kr';
import '@fontsource-variable/nunito';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main>
      <p className="brand">learning-voca</p>
      <section>
        <p className="label">개발 기반</p>
        <h1>학습 앱</h1>
        <p>앱 실행을 위한 기본 구성이 준비되었습니다.</p>
        <p className="muted">학습 기능은 아직 구현 전입니다.</p>
      </section>
    </main>
  </StrictMode>,
);
