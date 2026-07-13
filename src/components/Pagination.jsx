import React from 'react';

const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages = [];
    
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 3; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 2; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  const pages = getPageNumbers();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center', margin: '20px 0', padding: '5px', flexWrap: 'nowrap' }}>
      {currentPage > 1 && (
        <button
          onClick={() => onPageChange(currentPage - 1)}
          style={{
            padding: '6px 10px',
            backgroundColor: '#e63946', // Red color
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px'
          }}
        >
          ❮
        </button>
      )}

      {pages.map((page, index) => {
        if (page === '...') {
          return (
            <span key={`ellipsis-${index}`} style={{ color: '#000', fontWeight: 'bold', padding: '0 5px' }}>
              ...
            </span>
          );
        }

        const isActive = page === currentPage;
        return (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            style={{
              padding: '6px 10px',
              backgroundColor: isActive ? '#f8f9fa' : '#343a40',
              color: isActive ? '#000' : '#fff',
              border: isActive ? '1px solid #ddd' : 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              minWidth: '32px',
              fontSize: '14px'
            }}
          >
            {page}
          </button>
        );
      })}

      {currentPage < totalPages && (
        <button
          onClick={() => onPageChange(currentPage + 1)}
          style={{
            padding: '6px 10px',
            backgroundColor: '#e63946',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px'
          }}
        >
          ❯
        </button>
      )}
    </div>
  );
};

export default Pagination;
