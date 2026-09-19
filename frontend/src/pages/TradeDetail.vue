<template>
  <div class="trade-page">
    <van-nav-bar title="交易记录" left-arrow @click-left="router.back" />

    <van-loading v-if="loading" class="loading-center" />

    <template v-else-if="trade">
      <!-- 状态条 -->
      <div class="status-bar" :class="`st-${trade.status}`">
        <van-icon :name="statusIcon" size="26" />
        <div class="status-text">
          <div class="status-name">{{ tradeStatusMap[trade.status] }}</div>
          <div class="status-sub">{{ statusSubText }}</div>
        </div>
      </div>

      <!-- 书籍信息 -->
      <div class="card book-card" v-if="trade.book" @click="goBook">
        <van-image :src="trade.book.images?.[0]" width="64" height="64" fit="cover" radius="6" />
        <div class="book-meta">
          <div class="book-title">{{ trade.book.title }}</div>
          <div class="book-tags">
            <van-tag plain type="primary">{{ trade.book.courseCode }}</van-tag>
            <van-tag plain type="primary">{{ trade.book.edition }}</van-tag>
          </div>
          <div class="book-row">
            <span class="book-price">¥{{ trade.price }}</span>
            <van-tag :type="bookStatusTagType">{{ statusMap[trade.book.status] }}</van-tag>
          </div>
        </div>
      </div>

      <!-- 求购信息 -->
      <div class="card" v-if="trade.purchaseRequest">
        <div class="line"><span class="label">求购单</span>{{ trade.purchaseRequest.bookTitle }}</div>
        <div class="line">
          <span class="label">教材匹配</span>
          {{ trade.purchaseRequest.campus }} · {{ trade.purchaseRequest.courseCode }} ·
          {{ trade.purchaseRequest.edition }}
        </div>
      </div>

      <!-- 双方 -->
      <div class="card">
        <div class="line">
          <span class="label">我的身份</span>
          <van-tag :type="trade.role === 'buyer' ? 'primary' : 'warning'">
            {{ trade.role === 'buyer' ? '买家' : '卖家' }}
          </van-tag>
        </div>
        <div class="line"><span class="label">买家</span>{{ trade.buyerId }}</div>
        <div class="line"><span class="label">卖家</span>{{ trade.sellerId }}</div>
        <div class="line"><span class="label">交易单号</span><span class="mono">{{ trade.id }}</span></div>
        <div class="line"><span class="label">创建时间</span>{{ formatTime(trade.createdAt) }}</div>
      </div>

      <!-- 进行中：操作按钮 -->
      <div v-if="trade.status === 'pending'" class="actions">
        <van-button
          v-if="trade.role === 'buyer'"
          block
          round
          plain
          type="danger"
          @click="onCancel"
        >
          取消交易（释放书籍）
        </van-button>
        <template v-if="trade.role === 'seller'">
          <van-button block round plain type="danger" @click="onReject">
            拒绝预约（释放书籍）
          </van-button>
          <van-button block round type="primary" @click="onComplete">确认成交</van-button>
        </template>
        <van-button v-if="trade.role === 'buyer'" block round type="primary" @click="onComplete">
          确认成交
        </van-button>
      </div>

      <van-notice-bar
        v-else
        left-icon="info-o"
        :text="endedNotice"
      />
    </template>

    <van-empty v-else description="交易记录不存在" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { showToast, showConfirmDialog } from 'vant';
import { getTradeById, cancelTrade, rejectTrade, completeTrade } from '@/api/trade';
import type { Trade } from '@/types';
import { tradeStatusMap, statusMap } from '@/types';

const router = useRouter();
const route = useRoute();

const loading = ref(true);
const trade = ref<Trade | null>(null);

const statusIcon = computed(() => {
  switch (trade.value?.status) {
    case 'pending':
      return 'underway-o';
    case 'completed':
      return 'passed';
    case 'cancelled':
    case 'rejected':
      return 'close';
    default:
      return 'info-o';
  }
});

const statusSubText = computed(() => {
  const t = trade.value;
  if (!t) return '';
  if (t.status === 'pending') return '书籍已预约，等待卖家与买家完成交易';
  if (t.status === 'completed') return '书籍已售出';
  if (t.status === 'cancelled') return '买家已取消，书籍已释放，其他求购单可重新匹配';
  return '卖家已拒绝，书籍已释放，其他求购单可重新匹配';
});

const endedNotice = computed(() => statusSubText.value);

const bookStatusTagType = computed(() => {
  const s = trade.value?.book?.status;
  if (s === 'available') return 'success';
  if (s === 'reserved') return 'warning';
  return 'default';
});

const formatTime = (v: string) => new Date(v).toLocaleString();

const goBook = () => {
  if (trade.value?.bookId) router.push(`/book/${trade.value.bookId}`);
};

const fetchTrade = async () => {
  loading.value = true;
  try {
    trade.value = await getTradeById(route.params.id as string);
  } finally {
    loading.value = false;
  }
};

const onCancel = async () => {
  try {
    await showConfirmDialog({ title: '取消交易', message: '取消后该书将被释放，其他求购单可重新匹配。确定取消吗？' });
  } catch {
    return;
  }
  try {
    await cancelTrade(route.params.id as string);
    showToast('已取消，书籍已释放');
    await fetchTrade();
  } catch {}
};

const onReject = async () => {
  try {
    await showConfirmDialog({ title: '拒绝预约', message: '拒绝后该书将被释放，其他求购单可重新匹配。确定拒绝吗？' });
  } catch {
    return;
  }
  try {
    await rejectTrade(route.params.id as string);
    showToast('已拒绝，书籍已释放');
    await fetchTrade();
  } catch {}
};

const onComplete = async () => {
  try {
    await showConfirmDialog({ title: '确认成交', message: '确认交易完成？完成后书籍将标记为已售出。' });
  } catch {
    return;
  }
  try {
    await completeTrade(route.params.id as string);
    showToast('交易已完成');
    await fetchTrade();
  } catch {}
};

onMounted(fetchTrade);
</script>

<style scoped>
.loading-center {
  display: flex;
  justify-content: center;
  padding: 100px;
}
.status-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 12px;
  padding: 20px 16px;
  border-radius: 8px;
  color: #fff;
}
.status-bar.st-pending {
  background: linear-gradient(135deg, #1989fa, #4ba7fb);
}
.status-bar.st-completed {
  background: linear-gradient(135deg, #07c160, #35d07f);
}
.status-bar.st-cancelled,
.status-bar.st-rejected {
  background: linear-gradient(135deg, #9aa3ad, #b5bcc4);
}
.status-name {
  font-size: 18px;
  font-weight: 600;
}
.status-sub {
  font-size: 12px;
  opacity: 0.9;
  margin-top: 2px;
}
.card {
  background: #fff;
  margin: 12px;
  border-radius: 8px;
  padding: 14px 16px;
}
.book-card {
  display: flex;
  gap: 12px;
}
.book-meta {
  flex: 1;
  min-width: 0;
}
.book-title {
  font-size: 15px;
  font-weight: 500;
}
.book-tags {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.book-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}
.book-price {
  color: #ee0a24;
  font-weight: 700;
  font-size: 16px;
}
.line {
  font-size: 13px;
  color: #333;
  padding: 6px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.label {
  color: #999;
  width: 64px;
  flex-shrink: 0;
}
.mono {
  font-family: monospace;
  font-size: 11px;
  color: #999;
  word-break: break-all;
}
.actions {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
