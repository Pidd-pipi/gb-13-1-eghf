<template>
  <div class="page-container">
    <van-nav-bar title="我的求购" left-arrow @click-left="router.back">
      <template #right>
        <van-icon name="plus" size="20" @click="router.push('/publish-request')" />
      </template>
    </van-nav-bar>

    <van-loading v-if="loading" class="loading-center" />

    <div v-else-if="requests.length > 0" class="list">
      <div v-for="request in requests" :key="request.id" class="request-card" @click="goDetail(request.id)">
        <div class="card-top">
          <div class="title">{{ request.bookTitle }}</div>
          <van-tag :type="statusTagType(request.status)">{{ purchaseStatusMap[request.status] }}</van-tag>
        </div>
        <div class="match-tags">
          <van-tag plain type="primary">{{ request.campus }}</van-tag>
          <van-tag plain type="primary">{{ request.courseCode }}</van-tag>
          <van-tag plain type="primary">{{ request.edition }}</van-tag>
        </div>
        <div class="card-bottom">
          <span class="candidate" :class="{ zero: request.candidateCount === 0 }">
            剩余候选书 {{ request.candidateCount ?? 0 }} 本
          </span>
          <van-button
            v-if="request.status === 'active'"
            size="mini"
            plain
            type="danger"
            @click.stop="onClose(request)"
          >
            关闭求购
          </van-button>
          <van-button
            v-if="request.status === 'matched'"
            size="mini"
            type="primary"
            @click.stop="goTransactions"
          >
            查看预约
          </van-button>
        </div>
      </div>
    </div>

    <van-empty v-else description="还没有发布求购单">
      <van-button type="primary" round @click="router.push('/publish-request')">去发布求购</van-button>
    </van-empty>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { getMyPurchaseRequests, closePurchaseRequest } from '@/api/purchase';
import { purchaseStatusMap } from '@/types';
import type { PurchaseRequest, PurchaseRequestStatus } from '@/types';

const router = useRouter();
const loading = ref(true);
const requests = ref<PurchaseRequest[]>([]);

const statusTagType = (status: PurchaseRequestStatus) =>
  status === 'active' ? 'primary' : status === 'matched' ? 'warning' : 'default';

const fetchData = async () => {
  loading.value = true;
  try {
    requests.value = await getMyPurchaseRequests();
  } finally {
    loading.value = false;
  }
};

const goDetail = (id: string) => router.push(`/purchase-request/${id}`);
const goTransactions = () => router.push('/transactions');

const onClose = async (request: PurchaseRequest) => {
  try {
    await showConfirmDialog({ title: '关闭该求购单？', message: '关闭后不再参与教材匹配。' });
  } catch {
    return;
  }
  try {
    await closePurchaseRequest(request.id);
    showToast('已关闭');
    fetchData();
  } catch {}
};

onMounted(fetchData);
</script>

<style scoped>
.loading-center {
  display: flex;
  justify-content: center;
  padding: 100px;
}
.list {
  padding: 12px;
}
.request-card {
  background: white;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.title {
  font-size: 15px;
  font-weight: 500;
}
.match-tags {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.card-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #f5f5f5;
}
.candidate {
  font-size: 12px;
  color: #1989fa;
}
.candidate.zero {
  color: #999;
}
</style>
