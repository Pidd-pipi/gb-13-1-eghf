<template>
  <div class="page-container">
    <van-nav-bar title="我的求购" left-arrow @click-left="router.back">
      <template #right>
        <van-icon name="plus" size="20" @click="router.push('/publish-request')" />
      </template>
    </van-nav-bar>

    <van-loading v-if="loading" class="loading-center" />

    <div v-else-if="requests.length" class="request-list">
      <div v-for="req in requests" :key="req.id" class="request-card" @click="goDetail(req.id)">
        <div class="request-header">
          <div class="request-title">{{ req.bookTitle }}</div>
          <van-tag :type="req.status === 'active' ? 'primary' : 'default'">
            {{ req.status === 'active' ? '求购中' : '已关闭' }}
          </van-tag>
        </div>
        <div class="request-tags">
          <van-tag plain type="primary">{{ req.courseCode }}</van-tag>
          <van-tag plain type="primary">{{ req.edition }}</van-tag>
          <van-tag plain type="default">{{ req.campus }}</van-tag>
        </div>
        <div class="request-footer">
          <span v-if="req.status === 'active'" :class="{ zero: req.candidateCount === 0 }">
            剩余同版候选 {{ req.candidateCount ?? 0 }} 本
          </span>
          <span v-else>已关闭</span>
          <van-button v-if="req.pendingTrades?.length" size="mini" type="primary" @click.stop="goTrade(req.pendingTrades![0].id)">
            查看交易
          </van-button>
        </div>
      </div>
    </div>

    <van-empty v-else description="还没有发布求购单">
      <van-button type="primary" round @click="router.push('/publish-request')">去发布</van-button>
    </van-empty>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { getMyPurchaseRequests } from '@/api/purchase';
import type { PurchaseRequest } from '@/types';

const router = useRouter();
const loading = ref(true);
const requests = ref<PurchaseRequest[]>([]);

const fetchRequests = async () => {
  loading.value = true;
  try {
    requests.value = await getMyPurchaseRequests();
  } finally {
    loading.value = false;
  }
};

const goDetail = (id: string) => router.push(`/purchase-requests/${id}`);
const goTrade = (id: string) => router.push(`/trade/${id}`);

onMounted(fetchRequests);
</script>

<style scoped>
.loading-center {
  display: flex;
  justify-content: center;
  padding: 100px;
}
.request-list {
  padding: 12px;
}
.request-card {
  background: white;
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 12px;
}
.request-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.request-title {
  font-size: 15px;
  font-weight: 500;
}
.request-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.request-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #f0f0f0;
  font-size: 12px;
  color: #1989fa;
}
.request-footer .zero {
  color: #999;
}
</style>
