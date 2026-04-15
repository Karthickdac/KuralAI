import React, { useState, useEffect, useCallback } from 'react';
import { paymentsApi } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import Sidebar from '../components/Sidebar';
import styles from './Billing.module.css';

export default function Billing() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [balance, setBalance] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRecharge, setShowRecharge] = useState(false);
  const [rechargeMinutes, setRechargeMinutes] = useState(60);

  const RATE_PER_MIN = 10;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, balanceRes, subRes, txRes] = await Promise.all([
        paymentsApi.plans(),
        paymentsApi.balance(),
        paymentsApi.subscription(),
        paymentsApi.transactions(),
      ]);
      setPlans(plansRes.data);
      setBalance(balanceRes.data);
      setSubscription(subRes.data);
      setTransactions(txRes.data?.rows || []);
    } catch (err) {
      console.error('Billing load error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handlePayment = async (type, planId = null) => {
    try {
      const orderData = type === 'plan'
        ? { type: 'plan', planId }
        : { type: 'recharge', rechargeMinutes, rechargeAmount: rechargeMinutes * RATE_PER_MIN };

      const { data: order } = await paymentsApi.createOrder(orderData);

      const options = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'KuralAI',
        description: type === 'plan' ? 'Plan Subscription' : `Credit Recharge — ${rechargeMinutes} minutes`,
        order_id: order.orderId,
        handler: async (response) => {
          await paymentsApi.verify({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          setShowRecharge(false);
          load();
        },
        theme: { color: '#059669' },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      alert(err.response?.data?.error || 'Payment failed. Razorpay may not be configured.');
    }
  };

  const availableMin = balance
    ? Math.max(0, balance.totalMinutes - balance.usedMinutes - (balance.reservedMinutes || 0))
    : 0;

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <div className={styles.pageTitle}>Billing & Credits</div>
            <div className={styles.pageSub}>Manage subscription and call credits</div>
          </div>
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>Loading...</div>
          ) : (
            <>
              <div className={styles.topRow}>
                <div className={styles.card}>
                  <div className={styles.cardLabel}>Current Plan</div>
                  <div className={styles.planName}>{subscription?.plan?.name || 'No Plan'}</div>
                  {subscription?.currentPeriodEnd && (
                    <div className={styles.cardMeta}>
                      Renews: {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-IN')}
                    </div>
                  )}
                </div>
                <div className={styles.card}>
                  <div className={styles.cardLabel}>Available Credits</div>
                  <div className={styles.creditValue}>{availableMin.toFixed(1)} <span className={styles.unit}>min</span></div>
                  <div className={styles.cardMeta}>
                    Total: {balance?.totalMinutes?.toFixed(1) || 0} | Used: {balance?.usedMinutes?.toFixed(1) || 0}
                  </div>
                  <button className={styles.rechargeBtn} onClick={() => setShowRecharge(true)}>
                    + Recharge Credits
                  </button>
                </div>
              </div>

              

              <div className={styles.section}>
                <h3>Available Plans</h3>
                <div className={styles.planGrid}>
                  {plans.map(plan => (
                    <div
                      key={plan.id}
                      className={`${styles.planCard} ${subscription?.plan?.id === plan.id ? styles.currentPlan : ''}`}
                    >
                      <div className={styles.planHeader}>
                        <div className={styles.planTitle}>{plan.name}</div>
                        <div className={styles.planPrice}>₹{plan.price.toLocaleString('en-IN')}<span>/{plan.billingCycle}</span></div>
                      </div>
                      <div className={styles.planDesc}>{plan.description}</div>
                      <ul className={styles.planFeatures}>
                        <li>{plan.creditMinutes} minutes/month</li>
                        <li>Up to {plan.maxCustomers} customers</li>
                        <li>{plan.maxCampaigns} campaigns</li>
                        <li>{plan.maxWorkflows} workflows</li>
                        <li>{plan.maxUsersPerOrg} users</li>
                      </ul>
                      {subscription?.plan?.id === plan.id ? (
                        <div className={styles.currentBadge}>Current Plan</div>
                      ) : (
                        <button className={styles.primaryBtn} onClick={() => handlePayment('plan', plan.id)}>
                          {subscription?.plan ? 'Switch Plan' : 'Subscribe'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.section}>
                <h3>Transaction History</h3>
                <div className={styles.table}>
                  <div className={styles.tableHeader}>
                    <span>Date</span>
                    <span>Type</span>
                    <span>Minutes</span>
                    <span>Amount</span>
                    <span>Description</span>
                  </div>
                  {transactions.length === 0 ? (
                    <div className={styles.empty}>No transactions yet</div>
                  ) : (
                    transactions.map(tx => (
                      <div key={tx.id} className={styles.tableRow}>
                        <span>{new Date(tx.createdAt).toLocaleDateString('en-IN')}</span>
                        <span className={styles.txType}>{tx.type}</span>
                        <span className={tx.minutes > 0 ? styles.positive : styles.negative}>
                          {tx.minutes > 0 ? '+' : ''}{tx.minutes.toFixed(1)}
                        </span>
                        <span>{tx.amount ? `₹${tx.amount}` : '—'}</span>
                        <span className={styles.txDesc}>{tx.description}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {showRecharge && (
          <div className={styles.rechargeModal} onClick={() => setShowRecharge(false)}>
            <div className={styles.rechargeCard} onClick={e => e.stopPropagation()}>
              <h4>Recharge Call Credits</h4>
              <div className={styles.rechargeForm}>
                <label>Minutes</label>
                <input
                  type="number" min={10} step={10} value={rechargeMinutes}
                  onChange={e => setRechargeMinutes(Number(e.target.value))}
                  className={styles.input}
                />
                <div className={styles.rechargeSummary}>
                  {rechargeMinutes} minutes = ₹{(rechargeMinutes * RATE_PER_MIN).toLocaleString('en-IN')}
                </div>
                <div className={styles.rechargeActions}>
                  <button className={styles.primaryBtn} onClick={() => handlePayment('recharge')}>Pay with Razorpay</button>
                  <button className={styles.secondaryBtn} onClick={() => setShowRecharge(false)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
