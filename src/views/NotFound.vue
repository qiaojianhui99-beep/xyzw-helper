<template>
  <div class="not-found-page">
    <div class="container">
      <div class="error-content">
        <div class="error-visual">
          <div class="error-number">404</div>
          <div class="error-icon">
            <n-icon size="120">
              <Search />
            </n-icon>
          </div>
        </div>

        <div class="error-text">
          <h1>页面未找到</h1>
          <p>抱歉，您访问的页面不存在或已被移除。</p>
        </div>

        <div class="error-actions">
          <n-button type="primary" size="large" @click="router.push('/')">
            返回首页
          </n-button>
          <n-button size="large" @click="router.back()"> 返回上一页 </n-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Search } from "@vicons/ionicons5";
import { useRouter } from "vue-router";

const router = useRouter();
</script>

<style scoped lang="scss">
.not-found-page {
  min-height: 100vh;
  background: var(--color-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-lg);
}


.error-content {
  color: var(--color-text-primary);
  text-align: center;
  max-width: 600px;
}

.error-visual {
  position: relative;
  margin-bottom: var(--spacing-xl);
}

.error-number {
  font-family: var(--font-family-mono);
  font-variant-numeric: tabular-nums;
  font-size: 12rem;
  font-weight: var(--font-weight-bold);
  color: var(--color-accent);
  opacity: 0.12;
  line-height: 1;
}

.error-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  color: var(--color-icon);
  transform: translate(-50%, -50%);
}

.error-text {
  margin-bottom: var(--spacing-2xl);

  h1 {
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
    margin-bottom: var(--spacing-md);
  }

  p {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin: 0;
  }
}

.error-actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: center;
}

@media (max-width: 640px) {
  .error-number {
    font-size: 8rem;
  }

  .error-actions {
    flex-direction: column;
    align-items: center;
  }
}
</style>
