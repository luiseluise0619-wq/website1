/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /* Docker/Fly.io 배포용 최소 실행 번들.
     Vercel 은 자체 빌드 파이프라인을 쓰므로 이 값을 켜지 않는다 —
     DOCKER_BUILD 가 있을 때만 활성화해 두 배포 경로가 서로 간섭하지 않게 한다. */
  output: process.env.DOCKER_BUILD ? 'standalone' : undefined,
  /* 이미지 블록은 next/image 가 아니라 순수 <img> 를 쓴다(관리자가 임의 URL 을
     붙여넣을 수 있어야 하므로). 최적화기를 열어두면 외부에서 임의 이미지를
     우리 도메인으로 프록시시켜 대역폭을 소모시킬 수 있으므로 비활성화한다. */
  images: { unoptimized: true },
};

export default nextConfig;
