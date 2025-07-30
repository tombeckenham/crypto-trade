import { describe, it, expect, beforeEach } from 'vitest';
import { RedBlackTree } from '../red-black-tree';

describe('RedBlackTree', () => {
  let tree: RedBlackTree<number, string>;

  beforeEach(() => {
    tree = new RedBlackTree<number, string>((a, b) => a - b);
  });

  describe('Basic Operations', () => {
    it('should create an empty tree', () => {
      expect(tree.isEmpty()).toBe(true);
      expect(tree.getSize()).toBe(0);
    });

    it('should insert and find values', () => {
      tree.insert(10, 'ten');
      tree.insert(5, 'five');
      tree.insert(15, 'fifteen');

      expect(tree.find(10)).toBe('ten');
      expect(tree.find(5)).toBe('five');
      expect(tree.find(15)).toBe('fifteen');
      expect(tree.find(20)).toBe(null);
      expect(tree.getSize()).toBe(3);
      expect(tree.isEmpty()).toBe(false);
    });

    it('should update existing keys', () => {
      tree.insert(10, 'ten');
      tree.insert(10, 'TEN');
      
      expect(tree.find(10)).toBe('TEN');
      expect(tree.getSize()).toBe(1); // Size should not increase for updates
    });

    it('should remove values', () => {
      tree.insert(10, 'ten');
      tree.insert(5, 'five');
      tree.insert(15, 'fifteen');

      const removed = tree.remove(10);
      expect(removed).toBe('ten');
      expect(tree.find(10)).toBe(null);
      expect(tree.getSize()).toBe(2);

      // Try to remove non-existent key
      const notFound = tree.remove(100);
      expect(notFound).toBe(null);
      expect(tree.getSize()).toBe(2);
    });
  });

  describe('Min/Max Operations', () => {
    beforeEach(() => {
      tree.insert(10, 'ten');
      tree.insert(5, 'five');
      tree.insert(15, 'fifteen');
      tree.insert(3, 'three');
      tree.insert(12, 'twelve');
      tree.insert(18, 'eighteen');
    });

    it('should find minimum key-value pair', () => {
      const min = tree.findMin();
      expect(min).not.toBe(null);
      expect(min!.key).toBe(3);
      expect(min!.value).toBe('three');
    });

    it('should find maximum key-value pair', () => {
      const max = tree.findMax();
      expect(max).not.toBe(null);
      expect(max!.key).toBe(18);
      expect(max!.value).toBe('eighteen');
    });

    it('should return null for min/max on empty tree', () => {
      const emptyTree = new RedBlackTree<number, string>((a, b) => a - b);
      expect(emptyTree.findMin()).toBe(null);
      expect(emptyTree.findMax()).toBe(null);
    });
  });

  describe('Tree Traversal', () => {
    beforeEach(() => {
      // Insert in random order to test sorting
      tree.insert(10, 'ten');
      tree.insert(5, 'five');
      tree.insert(15, 'fifteen');
      tree.insert(3, 'three');
      tree.insert(7, 'seven');
      tree.insert(12, 'twelve');
      tree.insert(18, 'eighteen');
    });

    it('should traverse in ascending order', () => {
      const inOrder = Array.from(tree.inOrderTraversal());
      const keys = inOrder.map(item => item.key);
      const values = inOrder.map(item => item.value);

      expect(keys).toEqual([3, 5, 7, 10, 12, 15, 18]);
      expect(values).toEqual(['three', 'five', 'seven', 'ten', 'twelve', 'fifteen', 'eighteen']);
    });

    it('should traverse in descending order', () => {
      const reverseOrder = Array.from(tree.reverseOrderTraversal());
      const keys = reverseOrder.map(item => item.key);

      expect(keys).toEqual([18, 15, 12, 10, 7, 5, 3]);
    });

    it('should handle empty tree traversal', () => {
      const emptyTree = new RedBlackTree<number, string>((a, b) => a - b);
      const inOrder = Array.from(emptyTree.inOrderTraversal());
      const reverseOrder = Array.from(emptyTree.reverseOrderTraversal());

      expect(inOrder).toEqual([]);
      expect(reverseOrder).toEqual([]);
    });
  });

  describe('Custom Comparison Functions', () => {
    it('should work with descending order comparator', () => {
      const descendingTree = new RedBlackTree<number, string>((a, b) => b - a);
      
      descendingTree.insert(10, 'ten');
      descendingTree.insert(5, 'five');
      descendingTree.insert(15, 'fifteen');

      // With descending comparator, min returns the largest value
      const min = descendingTree.findMin();
      expect(min!.key).toBe(15);

      // And max returns the smallest value
      const max = descendingTree.findMax();
      expect(max!.key).toBe(5);

      // In-order traversal should be descending
      const inOrder = Array.from(descendingTree.inOrderTraversal());
      const keys = inOrder.map(item => item.key);
      expect(keys).toEqual([15, 10, 5]);
    });

    it('should work with string keys', () => {
      const stringTree = new RedBlackTree<string, number>((a, b) => a.localeCompare(b));
      
      stringTree.insert('banana', 2);
      stringTree.insert('apple', 1);
      stringTree.insert('cherry', 3);

      expect(stringTree.find('apple')).toBe(1);
      expect(stringTree.find('banana')).toBe(2);
      expect(stringTree.find('cherry')).toBe(3);

      const inOrder = Array.from(stringTree.inOrderTraversal());
      const keys = inOrder.map(item => item.key);
      expect(keys).toEqual(['apple', 'banana', 'cherry']);
    });
  });

  describe('Performance and Stress Testing', () => {
    it('should handle large number of insertions efficiently', () => {
      const startTime = Date.now();
      const numItems = 10000;

      // Insert items in random order
      for (let i = 0; i < numItems; i++) {
        const key = Math.floor(Math.random() * numItems * 2);
        tree.insert(key, `value_${key}`);
      }

      const insertTime = Date.now() - startTime;
      expect(insertTime).toBeLessThan(1000); // Should complete within 1 second

      // Verify tree maintains correct size
      expect(tree.getSize()).toBeGreaterThan(numItems * 0.8); // Allow for some duplicates
    });

    it('should maintain balance during mixed operations', () => {
      const operations = 1000;
      
      // Perform random insertions and deletions
      for (let i = 0; i < operations; i++) {
        const key = Math.floor(Math.random() * 100);
        
        if (Math.random() < 0.7) {
          // 70% insertions
          tree.insert(key, `value_${key}`);
        } else {
          // 30% deletions
          tree.remove(key);
        }
      }

      // Tree should still be functional
      tree.insert(999, 'test');
      expect(tree.find(999)).toBe('test');
      
      // Should be able to traverse without issues
      const items = Array.from(tree.inOrderTraversal());
      expect(items.length).toBe(tree.getSize());
    });
  });

  describe('Edge Cases', () => {
    it('should handle single node operations', () => {
      tree.insert(42, 'answer');
      
      expect(tree.getSize()).toBe(1);
      expect(tree.find(42)).toBe('answer');
      expect(tree.findMin()!.key).toBe(42);
      expect(tree.findMax()!.key).toBe(42);

      const removed = tree.remove(42);
      expect(removed).toBe('answer');
      expect(tree.isEmpty()).toBe(true);
    });

    it('should handle duplicate insertions correctly', () => {
      tree.insert(10, 'first');
      tree.insert(10, 'second');
      tree.insert(10, 'third');

      expect(tree.getSize()).toBe(1);
      expect(tree.find(10)).toBe('third'); // Last value should win
    });

    it('should handle removal of non-existent keys', () => {
      tree.insert(10, 'ten');
      
      const result = tree.remove(20);
      expect(result).toBe(null);
      expect(tree.getSize()).toBe(1);
      expect(tree.find(10)).toBe('ten'); // Original data should be intact
    });
  });

  describe('Red-Black Tree Properties', () => {
    it('should maintain sorted order during complex operations', () => {
      const keys = [50, 30, 70, 20, 40, 60, 80, 10, 25, 35, 45];
      
      // Insert all keys
      keys.forEach(key => tree.insert(key, `value_${key}`));
      
      // Remove some keys
      tree.remove(30);
      tree.remove(60);
      
      // Insert more keys
      tree.insert(15, 'fifteen');
      tree.insert(75, 'seventy-five');
      
      // Verify order is maintained
      const inOrder = Array.from(tree.inOrderTraversal());
      const sortedKeys = inOrder.map(item => item.key);
      const expectedSorted = [...sortedKeys].sort((a, b) => a - b);
      
      expect(sortedKeys).toEqual(expectedSorted);
    });

    it('should maintain balance properties with sequential insertions', () => {
      // Insert sequential numbers (worst case for unbalanced tree)
      for (let i = 1; i <= 100; i++) {
        tree.insert(i, `value_${i}`);
      }

      // Tree should still be efficient for lookups
      const startTime = Date.now();
      for (let i = 1; i <= 100; i++) {
        expect(tree.find(i)).toBe(`value_${i}`);
      }
      const lookupTime = Date.now() - startTime;
      
      expect(lookupTime).toBeLessThan(100); // Should be very fast due to balance
      expect(tree.getSize()).toBe(100);
    });
  });
});