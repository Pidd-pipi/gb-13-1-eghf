<template>
  <div class="page-container">
    <van-nav-bar title="交易记录" left-arrow @click-left="router.back" />

    <van-tabs v-model:active="role" @change="fetchData">
      <van-tab title="全部" name="all" />
      <van-tab title="我买到的" name="buyer" />
      <van-tab title="我卖出的" name="seller" />
    </van-tabs>

    <van-pull-refresh v-model="refreshing" @refresh="onRefresh" class="refresh-wrap">
      <van-loading v-if="loading && !refreshing" class="loading-center" />

      <div v-else-if="transactions.length > 0" class="list">
        <div v-for="tx in transactions" :key="tx.id" class="tx-card">
          <div class="tx-head" @click="goBook(tx.bookId)">
            <van-image
              :src="tx.book?.images?.[0]"
              width="56"
              height="56"
              fit="cover"
              radius="6"
            />
            <div class="tx-head-info">
              <div class="tx-title">{{ tx.book?.title || '书籍已下架' }}</div>
              <div class="tx-meta">
                {{ tx.book?.campus }} · {{ tx.book?.courseCode }} · {{ tx.book?.edition }}
              </div>
              <div class="tx-price">成交价 ¥{{ tx.priceSnapshot }}</div>
            </div>
            <van-tag :type="statusTagType(tx.status)">{{ transactionStatusMap[tx.status] }}</van-tag>
          </div>

          <div class="tx-parties">
            <span>买家：{{ tx.buyer?.name || tx.buyer?.studentId || '匿名' }}</span>
            <span>卖家：{{ tx.seller?.name || tx.seller?.studentId || '匿名' }}</span>
          </div>

          <div v-if="tx.matchReason?.length" class="reasons">
            <div v-for="(reason, i) in tx.matchReason" :key="i" class="reason-item">
              <van-icon name="success" color="#07c160" size="12" />
              <span>{{ reason }}</span>
            </div>
          </div>

          <div class="tx-actions">
            <!-- 卖家操作 -->
            <template v-if="isSeller(tx)">
              <van-button
                v-if="tx.status === 'pending'"
                size="small"
                round
                plain
                type="danger"
                @click="onReject(tx)"
              >
                拒绝（释放书籍）
              </van-button>
              <van-button
                v-if="tx.status === 'pending'"
                size="small"
                round
                type="primary"
                @click="onAccept(tx)"
              >
                接受预约
              </van-button>
              <van-button
                v-if="tx.status === 'accepted'"
                size="small"
                round
                type="primary"
                @click="onComplete(tx)"
              >
                确认完成
              </van-button>
            </template>
            <!-- 买家操作 -->
            <template v-else>
              <van-button
                v-if="['pending', 'accepted'].includes(tx.status)"
                size="small"
                round
                plain
                type="danger"
                @click="onCancel(tx)"
              >
                取消预约
              </van-button>
              <van-button
                v-if="tx.status === 'accepted'"
                size="small"
                round
                type="primary"
                @click="onComplete(tx)"
              >
                确认完成
              </van-button>
            </template>
            <span class="tx-time">{{ formatTime(tx.createdAt) }}</span>
          </div>
        </div>
      </div>

      <van-empty v-else description="暂无交易记录" />
    </van-pull-refresh>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import {
  getMyTransactions,
  acceptTransaction,
  rejectTransaction,
  cancelTransaction,
  completeTransaction,
} from '@/api/transaction';
import { useAuthStore } from '@/store/auth';
import { transactionStatusMap } from '@/types';
import type { Transaction, TransactionStatus } from '@/types';

const router = useRouter();
const authStore = useAuthStore();

const role = ref<'all' | 'buyer' | 'seller'>('all');
const loading = ref(true);
const refreshing = ref(false);
const transactions = ref<Transaction[]>([]);

const isSeller = (tx: Transaction) => tx.sellerId === authStore.user?.id;

const statusTagType = (status: TransactionStatus) => {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'accepted':
      return 'primary';
    case 'completed':
      return 'success';
    default:
      return 'default';
  }
};

const fetchData = async () => {
  loading.value = true;
  try {
    transactions.value = await getMyTransactions(role.value);
  } finally {
    loading.value = false;
  }
};

const onRefresh = async () => {
  try {
    await fetchData();
    showToast('状态已刷新');
  } finally {
    refreshing.value = false;
  }
};

const goBook = (bookId: string) => router.push(`/book/${bookId}`);

const confirm = async (title: string, message: string) => {
  try {
    await showConfirmDialog({ title, message });
    return true;
  } catch {
    return false;
  }
};

const onAccept = async (tx: Transaction) => {
  try {
    await acceptTransaction(tx.id);
    showToast('已接受预约');
    fetchData();
  } catch {}
};

const onReject = async (tx: Transaction) => {
  if (!(await confirm('拒绝该预约？', '拒绝后书籍立即释放回可购买，其他求购单可重新匹配。'))) return;
  try {
    await rejectTransaction(tx.id);
    showToast('已拒绝，书籍已释放');
    fetchData();
  } catch {}
};

const onCancel = async (tx: Transaction) => {
  if (!(await confirm('取消该预约？', '取消后书籍立即释放，其他求购单可重新匹配。'))) return;
  try {
    await cancelTransaction(tx.id);
    showToast('已取消预约');
    fetchData();
  } catch {}
};

const onComplete = async (tx: Transaction) => {
  if (!(await confirm('确认完成交易？', '确认后书籍标记为已售出，求购单关闭。'))) return;
  try {
    await completeTransaction(tx.id);
    showToast('交易完成');
    fetchData();
  } catch {}
};

const formatTime = (time: string) => new Date(time).toLocaleString('zh-CN', { hour12: false });

onMounted(async () => {
  if (authStore.isAuthenticated && !authStore.user) {
    await authStore.fetchCurrentUser();
  }
  fetchData();
});
</script>

<style scoped>
.refresh-wrap {
  min-height: 60vh;
}
.loading-center {
  display: flex;
  justify-content: center;
  padding: 100px;
}
.list {
  padding: 12px;
}
.tx-card {
  background: white;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.tx-head {
  display: flex;
  gap: 10px;
}
.tx-head-info {
  flex: 1;
  min-width: 0;
}
.tx-title {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tx-meta {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}
.tx-price {
  font-size: 15px;
  font-weight: bold;
  color: #ff4d4f;
  margin-top: 4px;
}
.tx-parties {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #666;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f5f5f5;
}
.reasons {
  margin-top: 8px;
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
.tx-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f5f5f5;
}
.tx-time {
  font-size: 11px;
  color: #bbb;
  margin-right: auto;
}
</style>
