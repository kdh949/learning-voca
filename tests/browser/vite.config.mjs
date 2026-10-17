export default {
  // contracts의 CommonJS와 learning-core의 ESM 빌드를 공개 패키지 경계에서 검증한다.
  // 패키지를 다시 빌드해도 lockfile은 바뀌지 않는다. 이전 변환 캐시로 최신 코드를 검증했다고 오판하지 않는다.
  optimizeDeps: { force: true, include: ['@learning-voca/contracts', '@learning-voca/learning-core'] },
};
