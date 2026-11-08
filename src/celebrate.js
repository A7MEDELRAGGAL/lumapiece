const colors = ['#527f78', '#2d5f5a', '#e89a78', '#f0c36d', '#94c5b3', '#a95755'];

export function celebrate({ reducedMotion = false } = {}) {
  if (reducedMotion || typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:70';
  document.body.append(canvas);
  const context = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = () => {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  window.addEventListener('resize', size, { once: true });

  const particles = Array.from({ length: 140 }, () => ({
    x: Math.random() * window.innerWidth,
    y: -30 - Math.random() * window.innerHeight * 0.4,
    size: 5 + Math.random() * 7,
    color: colors[Math.floor(Math.random() * colors.length)],
    vy: 130 + Math.random() * 170,
    vx: -60 + Math.random() * 120,
    spin: -6 + Math.random() * 12,
    angle: Math.random() * Math.PI,
    round: Math.random() > 0.5,
  }));

  const started = performance.now();
  const tick = (now) => {
    const elapsed = (now - started) / 1000;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    particles.forEach((particle) => {
      particle.x += particle.vx / 60;
      particle.y += particle.vy / 60;
      particle.vy += 4;
      particle.angle += particle.spin / 60;
      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(particle.angle);
      context.fillStyle = particle.color;
      if (particle.round) {
        context.beginPath();
        context.arc(0, 0, particle.size / 2.4, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
      }
      context.restore();
    });
    if (elapsed < 3) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}
