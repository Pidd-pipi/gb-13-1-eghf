<template>
  <div class="page-container">
    <van-nav-bar title="求购单详情" left-arrow @click-left="router.back" />

    <van-loading v-if="loading" class="loading-center" />

    <template v-else-if="detail">
      <!-- 求购单信息 -->
      <div class="request-head">
        <div class="request-title-row">
          <div class="request-title">{{ detail.bookTitle }}</div>
          <van-tag :type="statusTag.type">{{ statusTag.text }}</van-tag>
        </div>
        <div class="match-tags">
          <van-tag plain type="primary">{{ detail.campus }}</van-tag>
          <van-tag plain type="primary">{{ detail.courseCode }}</van-tag>
          <van-tag plain type="primary">{{ detail.edition }}</van-tag>
        </div>
        <div class="request-sub" v-if="detail.author">作者：{{ detail.author }}</div>
        <div class="request-sub" v-if="detail.expectedPrice != null">
          期望价格：<span class="price">¥{{ detail.expectedPrice }}</span>
        </div>
      </div>

      <!-- 已选定书籍：展示预约状态，刷新后保持一致 -->
      <div v-if="activeTransaction" class="reserved-box">
        <div class="reserved-title">
          <van-icon name="clock-o" />
          当前预约：{{ activeTransaction.book?.title || '候选书' }}
        </div>
        <div class="reserved-status">{{ transactionStatusMap[activeTransaction.status] }}</div>
        <div class="reserved-reasons" v-if="activeTransaction.matchReason?.length">
          <div class="reason-title">匹配原因</div>
          <div v-for="(reason, i) in activeTransaction.matchReason" :key="i" class="reason-item">
            <van-icon name="success" color="#07c160" />
            <span>{{ reason }}</span>
          </div>
        </div>
        <div class="reserved-actions">
          <van-button
            v-if="isOwner && ['pending', 'accepted'].includes(activeTransaction.status)"
            size="small"
            round
            plain
            type="danger"
            @click="onCancel"
          >
            取消预约（释放给其他求购单）
          </van-button>
          <van-button
            v-if="isOwner && activeTransaction.status === 'accepted'"
            size="small"
            round
            type="primary"
            @click="onComplete"
          >
            确认完成交易
          </van-button>
        </div>
      </div>

      <!-- 候选书列表 -->
      <div class="candidate-head" v-if="isOwner">
        <span>候选教材（同校区 · 同课程代码 · 同版次 · 可购买）</span>
        <van-tag type="primary" round>{{ detail.candidateCount }}</van-tag>
      </div>

      <van-empty
        v-if="isOwner && detail.status === 'active' && (detail.candidates ?? []).length === 0"
        description="暂无匹配教材，发布其他校区或版次不符的书无法匹配"
      />

      <div v-if="isOwner" class="candidate-list">
        <div v-for="candidate in detail.candidates ?? []" :key="candidate.id" class="candidate-card">
          <van-image :src="candidate.images[0]" width="72" height="72" fit="cover" radius="6" />
          <div class="candidate-info">
            <div class="candidate-title">{{ candidate.title }}</div>
            <div class="candidate-meta">{{ candidate.author }} · {{ conditionMap[candidate.condition] }}</div>
            <div class="candidate-reasons">
              <div v-for="(reason, i) in candidate.reasons" :key="i" class="reason-item">
                <van-icon name="success" color="#07c160" size="12" />
                <span>{{ reason }}</span>
              </div>
            </div>
            <div class="candidate-bottom">
              <span class="candidate-price">¥{{ candidate.price }}</span>
              <van-button
                size="small"
                round
                type="primary"
                :loading="selectingId === candidate.id"
                :disabled="!!activeTransaction"
                @click="onSelect(candidate.id)"
              >
                {{ activeTransaction ? '已有预约' : '选定此书' }}
              </van-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 非求购者（如卖家浏览）只读提示 -->
      <van-notice-bar
        v-if="!isOwner"
        left-icon="info-o"
        text="这是他人的求购单，仅求购者本人可选定教材"
      />
    </template>

    <van-empty v-else description="求购单不存在" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { showToast, showConfirmDialog } from 'vant';
import { getPurchaseRequestById } from '@/api/purchase';
import { selectBook, getMyTransactions, cancelTransaction, completeTransaction } from '@/api/transaction';
import { useAuthStore } from '@/store/auth';
import type { PurchaseRequest, Transaction } from '@/types';
import { conditionMap, purchaseStatusMap, transactionStatusMap } from '@/types';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const loading = ref(true);
const detail = ref<PurchaseRequest | null>(null);
const transactions = ref<Transaction[]>([]);
const selectingId = ref<string | null>(null);

const isOwner = computed(() => detail.value?.requesterId === authStore.user?.id);

const statusTag = computed(() => {
  switch (detail.value?.status) {
    case 'active':
      return { type: 'primary' as const, text: purchaseStatusMap.active };
    case 'matched':
      return { type: 'warning' as const, text: purchaseStatusMap.matched };
    default:
      return { type: 'default' as const, text: purchaseStatusMap.closed };
  }
});

const activeTransaction = computed(
  () => transactions.value.find((t) => t.purchaseRequestId === route.params.id && ['pending', 'accepted'].includes(t.status)) || null,
);

const fetchData = async () => {
  loading.value = true;
  try {
    const id = route.params.id as string;
    detail.value = await getPurchaseRequestById(id);
    if (authStore.isAuthenticated) {
      transactions.value = await getMyTransactions('all');
    }
  } finally {
    loading.value = false;
  }
};

const onSelect = async (bookId: string) => {
  try {
    await showConfirmDialog({
      title: '选定该教材？',
      message: '选定后该书会立即预约（其他同学无法再抢），并生成交易记录等待卖家确认。',
      confirmButtonText: '选定并预约',
    });
  } catch {
    return;
  }
  selectingId.value = bookId;
  try {
    const result = await selectBook(detail.value!.id, bookId);
    showToast(result.duplicated ? '你已预约该书，请勿重复选择' : '预约成功，等待卖家确认');
    await fetchData();
  } catch {
  } finally {
    selectingId.value = null;
  }
};

const onCancel = async () => {
  if (!activeTransaction.value) return;
  try {
    await showConfirmDialog({
      title: '取消预约？',
      message: '取消后该书将重新开放，其他求购单可以重新匹配。',
    });
  } catch {
    return;
  }
  try {
    await cancelTransaction(activeTransaction.value.id);
    showToast('已取消预约，书籍已释放');
    await fetchData();
  } catch {}
};

const onComplete = async () => {
  if (!activeTransaction.value) return;
  try {
    await showConfirmDialog({ title: '确认完成交易？', message: '确认后书籍将标记为已售出。' });
  } catch {
    return;
  }
  try {
    await completeTransaction(activeTransaction.value.id);
    showToast('交易完成');
    await fetchData();
  } catch {}
};

onMounted(async () => {
  if (authStore.isAuthenticated && !authStore.user) {
    await authStore.fetchCurrentUser();
  }
  await fetchData();
});
</script>

<style scoped>
.loading-center {
  display: flex;
  justify-content: center;
  padding: 100px;
}
.request-head {
  background: white;
  padding: 16px;
}
.request-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.request-title {
  font-size: 17px;
  font-weight: 600;
}
.match-tags {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.request-sub {
  font-size: 13px;
  color: #666;
  margin-top: 8px;
}
.request-sub .price {
  color: #ff4d4f;
}
.reserved-box {
  margin: 12px;
  padding: 12px;
  background: #fffbe8;
  border: 1px solid #ffe58f;
  border-radius: 8px;
}
.reserved-title {
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}
.reserved-status {
  font-size: 12px;
  color: #fa8c16;
  margin-top: 4px;
}
.reserved-reasons {
  margin-top: 10px;
}
.reason-title {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
}
.reason-item {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  font-size: 12px;
  color: #555;
  line-height: 1.7;
}
.reason-item .van-icon {
  margin-top: 3px;
}
.reserved-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.candidate-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;
  font-size: 14px;
  font-weight: 500;
}
.candidate-list {
  padding: 0 12px 12px;
}
.candidate-card {
  display: flex;
  gap: 10px;
  background: white;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.candidate-info {
  flex: 1;
  min-width: 0;
}
.candidate-title {
  font-size: 14px;
  font-weight: 500;
}
.candidate-meta {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}
.candidate-reasons {
  margin-top: 6px;
}
.candidate-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}
.candidate-price {
  font-size: 17px;
  font-weight: bold;
  color: #ff4d4f;
}
</style>
